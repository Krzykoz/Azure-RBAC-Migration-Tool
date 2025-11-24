
import { AccessPolicyEntry, MigrationAnalysis, RoleDefinition, SuggestedRole, RoleBreakdown, RoleAssignment, ExistingCoverageResult } from "../types";
import RBAC_MAPPING_CSV from "../assets/AcessPolicyRBACMapping.csv?raw";


type PermissionMap = Record<string, Record<string, string[]>>;


interface StrategyConfig {
  name: string;
  description: string;
  weights: {
    coverage: number; // Reward per permission covered
    excess: number;   // Penalty per excess permission
    roleCount: number; // Penalty per additional role (to prevent fragmentation)
  };
  threshold: number; // Minimum score required to accept a role
}


const parsePermissionMap = (csvContent: string): PermissionMap => {
  const map: PermissionMap = {
    keys: {},
    secrets: {},
    certificates: {},
    storage: {}
  };

  const lines = csvContent.trim().split('\n');

  const dataLines = lines.slice(1);

  dataLines.forEach(line => {
    const [policyPerm, rbacActions] = line.split(',');
    if (!policyPerm || !rbacActions) return;

    // Policy Perm format is usually "Category Action", e.g., "Key Get" or "Secret Set"
    // We need to parse this to match our internal keys (keys, secrets, etc.)
    const parts = policyPerm.trim().split(' ');
    if (parts.length < 2) return;

    const categoryRaw = parts[0].toLowerCase();
    const actionRaw = parts.slice(1).join('').toLowerCase(); // Handle multi-word actions like "ManageContacts"

    // Normalize category names to match AccessPolicyEntry keys
    let category = categoryRaw;
    if (categoryRaw === 'key') category = 'keys';
    if (categoryRaw === 'secret') category = 'secrets';
    if (categoryRaw === 'certificate') category = 'certificates';
    if (categoryRaw === 'storage') category = 'storage';

    if (!map[category]) {
      map[category] = {};
    }


    const actionsList = rbacActions.split(';').map(s => s.trim());
    map[category][actionRaw] = actionsList;
  });

  return map;
};

const PERMISSION_MAP = parsePermissionMap(RBAC_MAPPING_CSV);


const ALL_KNOWN_RBAC_ACTIONS = new Set<string>();
Object.values(PERMISSION_MAP).forEach(catMap => {
  Object.values(catMap).forEach(actions => {
    actions.forEach(a => ALL_KNOWN_RBAC_ACTIONS.add(a));
  });
});

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


const actionMatches = (roleAction: string, requiredAction: string): boolean => {
  const r = roleAction.toLowerCase();
  const req = requiredAction.toLowerCase();

  if (r === '*' || r === req) return true;
  if (r.endsWith('/*')) {
    const prefix = r.slice(0, -2);
    return req.startsWith(prefix);
  }
  // Handle specific wildcards like "Microsoft.KeyVault/vaults/secrets/*/action" if they exist
  if (r.includes('*')) {
    const regex = new RegExp('^' + r.split('*').map(escapeRegExp).join('.*') + '$');
    return regex.test(req);
  }
  return false;
};


const getRequiredActions = (policy: AccessPolicyEntry): Set<string> => {
  const actions = new Set<string>();

  Object.entries(policy.permissions).forEach(([resourceType, perms]) => {
    if (!perms || !Array.isArray(perms)) return;

    // Normalize resource type key
    const typeKey = resourceType.toLowerCase();
    const map = PERMISSION_MAP[typeKey];

    if (!map) return;

    perms.forEach(p => {
      const permKey = p.toLowerCase();

      // Handle Wildcards: "all" or "*" maps to ALL permissions in this category
      if (permKey === 'all' || permKey === '*') {
        Object.values(map).forEach(rbacList => {
          rbacList.forEach(action => actions.add(action));
        });
      } else {
        const mappedList = map[permKey];
        if (mappedList) {
          mappedList.forEach(action => actions.add(action));
        }
      }
    });
  });

  return actions;
};



const STRATEGIES: StrategyConfig[] = [
  {
    name: 'Max Coverage',
    description: 'Prioritizes covering all permissions, even if it means granting some excess access.',
    weights: {
      coverage: 10.0,   // Huge reward for coverage
      excess: 0.05,     // Very low penalty for excess (tolerant of "dirty" roles)
      roleCount: 2.0    // Moderate preference for fewer roles
    },
    threshold: -100 // Accept almost anything that adds value
  },
  {
    name: 'Minimize Excess',
    description: 'Strictly avoids excess permissions. May leave gaps if no clean role exists.',
    weights: {
      coverage: 2.0,    // Moderate reward
      excess: 5.0,      // Huge penalty for excess (rejects "dirty" roles)
      roleCount: 1.0
    },
    threshold: 0.1 // Only accept roles that have a positive net utility
  },
  {
    name: 'Balanced',
    description: 'A middle ground that seeks coverage while avoiding large security risks.',
    weights: {
      coverage: 5.0,    // High reward
      excess: 1.0,      // Moderate penalty (avoids "Owner", accepts small overlap)
      roleCount: 1.5
    },
    threshold: 0 // Accept neutral or positive utility
  }
];

export const analyzePolicies = (
  policies: AccessPolicyEntry[],
  availableRoles: RoleDefinition[]
): MigrationAnalysis[] => {

  // Filter roles to those relevant to Key Vault
  const kvRoles = availableRoles.filter(r => {
    return r.properties.permissions.some(p =>
      p.dataActions.some(da => da.toLowerCase().includes('microsoft.keyvault'))
    );
  });

  return policies.map(policy => {
    const requiredActions = getRequiredActions(policy);

    // Run all 3 strategies for every policy
    const recommendations: SuggestedRole[] = STRATEGIES.map(strategy =>
      runWeightedAnalysis(requiredActions, kvRoles, strategy)
    );

    return {
      originalPolicy: policy,
      recommendations: recommendations,

    };
  });
};

export const analyzeExistingCoverage = (
  policy: AccessPolicyEntry,
  assignments: RoleAssignment[],
  availableRoles: RoleDefinition[]
): ExistingCoverageResult => {
  const requiredActions = getRequiredActions(policy);
  const userAssignments = assignments.filter(a => a.properties.principalId === policy.objectId);

  const covered = new Set<string>();
  const excess = new Set<string>();
  const roleMatches: Array<{ roleName: string; covered: string[]; excess: string[] }> = [];

  const processedRoles = new Set<string>();

  userAssignments.forEach(assignment => {
    // Role Definition ID is usually a full path: /subscriptions/.../providers/Microsoft.Authorization/roleDefinitions/GUID
    // or just the GUID.
    const roleDefId = assignment.properties.roleDefinitionId.split('/').pop();
    const roleDef = availableRoles.find(r => r.name === roleDefId);

    if (roleDef && !processedRoles.has(roleDef.properties.roleName)) {
      processedRoles.add(roleDef.properties.roleName);

      const roleCovered = new Set<string>();
      const { covered: c, excess: e } = calculateCoverage(requiredActions, roleDef);

      c.forEach(perm => {
        covered.add(perm);
        roleCovered.add(perm);
      });

      // For excess, we only care about what this role gives that is NOT in the required set.
      // calculateCoverage already does this.
      e.forEach(perm => excess.add(perm));

      if (roleCovered.size > 0) {
        roleMatches.push({
          roleName: roleDef.properties.roleName,
          covered: Array.from(roleCovered),
          excess: Array.from(e)
        });
      }
    }
  });

  const missing = Array.from(requiredActions).filter(p => !covered.has(p));

  return {
    isFullyCovered: missing.length === 0,
    coveredPermissions: Array.from(covered),
    missingPermissions: missing,
    excessPermissions: Array.from(excess),
    roleMatches
  };
};


export function runWeightedAnalysis(
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig
): SuggestedRole {
  const MAX_COMBINATION_SIZE = 5;
  let bestCombination: RoleDefinition[] = [];
  let bestScore = -Infinity;
  let bestCovered = new Set<string>();
  let bestExcess = new Set<string>();


  const evaluateCombination = (combo: RoleDefinition[]) => {
    const combinedCovered = new Set<string>();
    const combinedExcess = new Set<string>();

    combo.forEach(role => {
      const { covered, excess } = calculateCoverage(required, role);
      covered.forEach(c => combinedCovered.add(c));
      excess.forEach(e => combinedExcess.add(e));
    });

    // Score Calculation
    // Score = (Coverage * W_Cov) - (Excess * W_Exc) - (RoleCount * W_RoleCount)
    const score = (combinedCovered.size * config.weights.coverage)
      - (combinedExcess.size * config.weights.excess)
      - ((combo.length - 1) * config.weights.roleCount); // Penalty for adding more roles

    if (score > bestScore) {
      bestScore = score;
      bestCombination = [...combo]; // Clone the array!
      bestCovered = combinedCovered;
      bestExcess = combinedExcess;
    }
  };

  // Generate all combinations up to MAX_COMBINATION_SIZE

  const usefulRoles = roles.filter(r => {
    const { covered } = calculateCoverage(required, r);
    return covered.size > 0;
  });


  let effectiveLimit = MAX_COMBINATION_SIZE;
  if (usefulRoles.length > 20) {
    // If we have many useful roles, cap recursion to 3 to prevent freeze
    effectiveLimit = 3;
    console.warn(`Too many useful roles (${usefulRoles.length}). Capping combination depth to 3.`);
  }


  const generateCombinations = (
    startIdx: number,
    currentCombo: RoleDefinition[]
  ) => {

    if (currentCombo.length > 0) {
      evaluateCombination(currentCombo);
    }


    if (currentCombo.length >= effectiveLimit) {
      return;
    }


    for (let i = startIdx; i < usefulRoles.length; i++) {
      currentCombo.push(usefulRoles[i]);
      generateCombinations(i + 1, currentCombo);
      currentCombo.pop(); // Backtrack
    }
  };

  generateCombinations(0, []);


  if (bestCombination.length === 0 || bestScore < config.threshold) {
    return {
      strategy: config.name,
      roleName: 'No Match',
      roleNames: [],
      confidence: 0,
      reasoning: `Could not find roles fitting the "${config.name}" criteria.`,
      coveredPermissions: [],
      missingPermissions: Array.from(required),
      excessPermissions: [],
      roleBreakdown: []
    };
  }


  const roleBreakdown: RoleBreakdown[] = bestCombination.map(role => {
    const { covered, excess } = calculateCoverage(required, role);
    return {
      roleName: role.properties.roleName,
      covered: Array.from(covered),
      excess: Array.from(excess)
    };
  });

  const missing = Array.from(required).filter(x => !bestCovered.has(x));
  const roleNames = bestCombination.map(r => r.properties.roleName);

  return {
    strategy: config.name,
    roleName: roleNames.join(' + '),
    roleNames: roleNames,
    confidence: calculateConfidence(required.size, bestCovered.size, bestExcess.size),
    reasoning: config.description,
    coveredPermissions: Array.from(bestCovered),
    missingPermissions: missing,
    excessPermissions: Array.from(bestExcess),
    roleBreakdown: roleBreakdown
  };
}

function calculateCoverage(required: Set<string>, role: RoleDefinition): { covered: Set<string>, excess: Set<string> } {
  const covered = new Set<string>();
  const excess = new Set<string>();

  role.properties.permissions.forEach(p => {
    p.dataActions.forEach(da => {
      if (!da.toLowerCase().includes('microsoft.keyvault')) return;

      const isWildcard = da.includes('*');

      if (isWildcard) {
        // Expand wildcard against known universe
        ALL_KNOWN_RBAC_ACTIONS.forEach(knownAction => {
          if (actionMatches(da, knownAction)) {
            if (required.has(knownAction)) {
              covered.add(knownAction);
            } else {
              excess.add(knownAction);
            }
          }
        });
      } else {

        const matchesReq = Array.from(required).find(req => req.toLowerCase() === da.toLowerCase());

        if (matchesReq) {
          covered.add(matchesReq);
        } else {
          // Only count as excess if it's a recognized data action (ignore random strings)
          if (ALL_KNOWN_RBAC_ACTIONS.has(da.toLowerCase()) || da.toLowerCase().endsWith('/action')) {
            excess.add(da);
          }
        }
      }
    });
  });

  return { covered, excess };
}

function calculateConfidence(totalNeeded: number, covered: number, excessCount: number): number {
  if (totalNeeded === 0) return 100;

  const coverageRatio = covered / totalNeeded; // 0 to 1

  // Penalty logic for confidence score (visual indicator only)
  const noiseRatio = excessCount / (totalNeeded + 5);
  const penalty = Math.min(noiseRatio * 0.5, 0.3);

  let score = (coverageRatio - penalty) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}
