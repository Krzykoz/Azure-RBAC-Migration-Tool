
import { AccessPolicyEntry, MigrationAnalysis, RoleDefinition, SuggestedRole, RoleBreakdown, RoleAssignment, ExistingCoverageResult } from "../types";
import RBAC_MAPPING_CSV from "../assets/AcessPolicyRBACMapping.csv?raw";

// Types for the mapping structure: Category -> Action -> Array of RBAC Strings
type PermissionMap = Record<string, Record<string, string[]>>;

// Configuration for the weighted algorithm
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

// Parse the CSV file into a structured map
const parsePermissionMap = (csvContent: string): PermissionMap => {
  const map: PermissionMap = {
    keys: {},
    secrets: {},
    certificates: {},
    storage: {}
  };

  const lines = csvContent.trim().split('\n');
  // Skip header
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

    // Split RBAC actions by semicolon if multiple exist
    const actionsList = rbacActions.split(';').map(s => s.trim());
    map[category][actionRaw] = actionsList;
  });

  return map;
};

const PERMISSION_MAP = parsePermissionMap(RBAC_MAPPING_CSV);

// Collect all known specific RBAC actions from the map for wildcard expansion
const ALL_KNOWN_RBAC_ACTIONS = new Set<string>();
Object.values(PERMISSION_MAP).forEach(catMap => {
  Object.values(catMap).forEach(actions => {
    actions.forEach(a => ALL_KNOWN_RBAC_ACTIONS.add(a));
  });
});

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper to check if a role permission (glob pattern) matches a required action
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

// Convert Access Policy to a Set of RBAC Data Actions
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

// --- ALGORITHM DEFINITIONS ---

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
      // We will populate this later if assignments are provided, 
      // but for now we can keep the signature compatible or update the caller to pass assignments.
      // Actually, let's update the signature of analyzePolicies to accept assignments optionally.
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
  const roleMatches: Array<{ roleName: string; covered: string[] }> = [];

  userAssignments.forEach(assignment => {
    // Role Definition ID is usually a full path: /subscriptions/.../providers/Microsoft.Authorization/roleDefinitions/GUID
    // or just the GUID.
    const roleDefId = assignment.properties.roleDefinitionId.split('/').pop();
    const roleDef = availableRoles.find(r => r.name === roleDefId);

    if (roleDef) {
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

/**
 * Core Weighted Greedy Algorithm
 */
function runWeightedAnalysis(
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig
): SuggestedRole {
  const remaining = new Set(required);
  const selectedRoles: RoleDefinition[] = [];
  const allCovered = new Set<string>();
  const allExcess = new Set<string>();

  const MAX_ROLES = 3; // Limit role combining complexity
  let iterations = 0;

  while (remaining.size > 0 && iterations < MAX_ROLES) {
    iterations++;

    let bestCandidate: RoleDefinition | null = null;
    let bestScore = -Infinity;

    for (const role of roles) {
      // 1. Calculate Impact relative to REMAINING needs
      const { covered: newlyCovered, excess: marginalExcess } = calculateCoverage(remaining, role);

      if (newlyCovered.size === 0) continue;

      // 2. Apply Weights
      // Score = (Coverage * W_Cov) - (Excess * W_Exc)
      const score = (newlyCovered.size * config.weights.coverage)
        - (marginalExcess.size * config.weights.excess);

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = role;
      }
    }

    // Check Threshold (if the best option is too "expensive" in terms of excess, stop)
    if (!bestCandidate || bestScore < config.threshold) break;

    selectedRoles.push(bestCandidate);

    // Update State
    const { covered } = calculateCoverage(remaining, bestCandidate);
    covered.forEach(c => {
      remaining.delete(c);
      allCovered.add(c);
    });

    // Global Excess Calculation (Needs to be against TOTAL required, not just remaining)
    const { excess } = calculateCoverage(required, bestCandidate);
    excess.forEach(e => allExcess.add(e));
  }

  // Build the role breakdown by calculating what each selected role covers from the TOTAL requirement
  const roleBreakdown: RoleBreakdown[] = selectedRoles.map(role => {
    const { covered, excess } = calculateCoverage(required, role);
    return {
      roleName: role.properties.roleName,
      covered: Array.from(covered),
      excess: Array.from(excess)
    };
  });

  // Final Analysis of the Combination
  const missing = Array.from(required).filter(x => !allCovered.has(x));
  const roleNames = selectedRoles.map(r => r.properties.roleName);

  // Fallback if empty
  if (roleNames.length === 0) {
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

  return {
    strategy: config.name,
    roleName: roleNames.join(' + '),
    roleNames: roleNames,
    confidence: calculateConfidence(required.size, allCovered.size, allExcess.size),
    reasoning: config.description,
    coveredPermissions: Array.from(allCovered),
    missingPermissions: missing,
    excessPermissions: Array.from(allExcess),
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
        // Specific action
        // Check if this specific action is required
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
