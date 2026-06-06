import {
  AccessPolicyEntry,
  MigrationAnalysis,
  RoleDefinition,
  SuggestedRole,
  RoleBreakdown,
  RoleAssignment,
  ExistingCoverageResult,
} from '../types';
import { ANALYSIS_STRATEGIES, ANALYSIS_CONSTANTS, StrategyConfig } from '../constants';
import RBAC_MAPPING_CSV from '../assets/AcessPolicyRBACMapping.csv?raw';

type PermissionMap = Record<string, Record<string, string[]>>;


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

// Lowercased companion set used for case-insensitive membership checks.
// Azure data actions are mixed-case (e.g. "Microsoft.KeyVault/vaults/keys/read"),
// so comparisons against a lowercased input must use this set, not ALL_KNOWN_RBAC_ACTIONS.
const ALL_KNOWN_RBAC_ACTIONS_LOWER = new Set<string>(
  Array.from(ALL_KNOWN_RBAC_ACTIONS, a => a.toLowerCase())
);

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

const mergeDuplicateStrategies = (strategies: SuggestedRole[]): SuggestedRole[] => {
  // Group strategies by their role signature (sorted, joined role names)
  const groupsBySignature = new Map<string, SuggestedRole[]>();

  strategies.forEach(strategy => {
    const signature = [...strategy.roleNames].sort().join(',');
    if (!groupsBySignature.has(signature)) {
      groupsBySignature.set(signature, []);
    }
    groupsBySignature.get(signature)!.push(strategy);
  });

  // Build result by merging groups with multiple strategies
  const uniqueStrategies: SuggestedRole[] = [];

  groupsBySignature.forEach((group, signature) => {
    if (group.length > 1 && signature !== '') {
      // Multiple strategies with identical roles - merge them
      const mergedStrategyNames = group.map(s => s.strategy).join(' / ');
      uniqueStrategies.push({
        ...group[0],
        strategy: mergedStrategyNames,
        reasoning: 'Multiple strategies produced identical role assignments for this policy.'
      });
    } else {
      // Single strategy or empty signature - keep as is
      uniqueStrategies.push(group[0]);
    }
  });

  return uniqueStrategies;
};

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
    const allRecommendations: SuggestedRole[] = ANALYSIS_STRATEGIES.map((strategy) =>
      runWeightedAnalysis(requiredActions, kvRoles, strategy)
    );

    // Merge duplicate strategies with identical outputs
    const recommendations = mergeDuplicateStrategies(allRecommendations);

    return {
      originalPolicy: policy,
      recommendations: recommendations,

    };
  });
};

export const analyzeExistingCoverage = (
  policy: AccessPolicyEntry,
  assignments: RoleAssignment[],
  availableRoles: RoleDefinition[],
  scopeFilter?: string
): ExistingCoverageResult => {
  const requiredActions = getRequiredActions(policy);
  const userAssignments = assignments.filter(a => {
    const samePrincipal = a.properties.principalId === policy.objectId;
    if (!samePrincipal) return false;

    if (!scopeFilter) return true;

    const scope = (a.properties.scope || '').toLowerCase();
    const target = scopeFilter.toLowerCase();

    // RBAC inherits downward: an assignment applies to the vault if it is scoped to the
    // vault itself OR to any ancestor (subscription / resource group). Assignments scoped to
    // a child resource (a single secret/key) must NOT be treated as vault-wide coverage.
    return scope === target || target.startsWith(scope + '/');
  });

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
  const maxCombinations = ANALYSIS_CONSTANTS.MAX_COMBINATION_SIZE;
  let bestCombination: RoleDefinition[] = [];
  let bestScore = -Infinity;
  let bestCovered = new Set<string>();
  let bestExcess = new Set<string>();

  // Precompute coverage for each role exactly once. Combination search reuses these
  // cached sets instead of recomputing calculateCoverage for every role in every subset.
  const coverageCache = new Map<RoleDefinition, { covered: Set<string>; excess: Set<string> }>();
  const getCoverage = (role: RoleDefinition) => {
    let entry = coverageCache.get(role);
    if (!entry) {
      entry = calculateCoverage(required, role);
      coverageCache.set(role, entry);
    }
    return entry;
  };

  const evaluateCombination = (combo: RoleDefinition[]) => {
    const combinedCovered = new Set<string>();
    const combinedExcess = new Set<string>();

    combo.forEach((role) => {
      const { covered, excess } = getCoverage(role);
      covered.forEach((c) => combinedCovered.add(c));
      excess.forEach((e) => combinedExcess.add(e));
    });

    // Score = (Coverage * W_Cov) - (Excess * W_Exc) - (RoleCount * W_RoleCount)
    const score =
      combinedCovered.size * config.weights.coverage -
      combinedExcess.size * config.weights.excess -
      (combo.length - 1) * config.weights.roleCount;

    if (score > bestScore) {
      bestScore = score;
      bestCombination = [...combo];
      bestCovered = combinedCovered;
      bestExcess = combinedExcess;
    }
  };

  // Filter to roles that cover at least one required permission
  const usefulRoles = roles.filter((r) => getCoverage(r).covered.size > 0);

  const generateCombinations = (startIdx: number, currentCombo: RoleDefinition[]) => {
    if (currentCombo.length > 0) {
      evaluateCombination(currentCombo);
    }

    if (currentCombo.length >= maxCombinations) {
      return;
    }

    for (let i = startIdx; i < usefulRoles.length; i++) {
      currentCombo.push(usefulRoles[i]);
      generateCombinations(i + 1, currentCombo);
      currentCombo.pop();
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
    const { covered, excess } = getCoverage(role);
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

  // Collect this role's Key Vault data actions and its exclusions (notDataActions).
  const dataActions: string[] = [];
  const notDataActions: string[] = [];
  role.properties.permissions.forEach(p => {
    (p.dataActions || []).forEach(da => {
      if (da.toLowerCase().includes('microsoft.keyvault')) dataActions.push(da);
    });
    (p.notDataActions || []).forEach(na => notDataActions.push(na));
  });

  // An action is excluded if any notDataAction matches it (notDataActions may be wildcards).
  const isExcluded = (action: string): boolean =>
    notDataActions.some(na => actionMatches(na, action));

  dataActions.forEach(da => {
    const isWildcard = da.includes('*');

    if (isWildcard) {
      // Expand wildcard against known universe, minus anything the role explicitly excludes.
      ALL_KNOWN_RBAC_ACTIONS.forEach(knownAction => {
        if (actionMatches(da, knownAction) && !isExcluded(knownAction)) {
          if (required.has(knownAction)) {
            covered.add(knownAction);
          } else {
            excess.add(knownAction);
          }
        }
      });
    } else {
      if (isExcluded(da)) return;

      const matchesReq = Array.from(required).find(req => req.toLowerCase() === da.toLowerCase());

      if (matchesReq) {
        covered.add(matchesReq);
      } else {
        // Only count as excess if it's a recognized data action (ignore random strings).
        // Compare against the lowercased set since Azure actions are mixed-case.
        if (ALL_KNOWN_RBAC_ACTIONS_LOWER.has(da.toLowerCase()) || da.toLowerCase().endsWith('/action')) {
          excess.add(da);
        }
      }
    }
  });

  return { covered, excess };
}

function calculateConfidence(totalNeeded: number, covered: number, excessCount: number): number {
  if (totalNeeded === 0) return 100;

  const coverageRatio = covered / totalNeeded; // 0 to 1
  return Math.max(0, Math.min(100, Math.round(coverageRatio * 100)));
}
