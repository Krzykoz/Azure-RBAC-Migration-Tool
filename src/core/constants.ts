/** Application-wide constants. */

export const AZURE_API_VERSIONS = {
  SUBSCRIPTIONS: '2022-12-01',
  RESOURCES: '2021-04-01',
  AUTHORIZATION: '2022-04-01',
  KEYVAULT: '2024-11-01',
} as const;

export const AZURE_ENDPOINTS = {
  ARM: 'https://management.azure.com',
  GRAPH: 'https://graph.microsoft.com/v1.0',
} as const;

export interface StrategyConfig {
  name: string;
  description: string;
  weights: {
    coverage: number;
    excess: number;
    roleCount: number;
  };
  threshold: number;
}

export const ANALYSIS_STRATEGIES: readonly StrategyConfig[] = [
  {
    name: 'Max Coverage',
    description: 'Prioritizes covering all permissions, even if it means granting some excess access.',
    weights: {
      coverage: 10.0,
      excess: 0.15,
      roleCount: 0.1,
    },
    threshold: -100,
  },
  {
    name: 'Minimize Excess',
    description: 'Strictly avoids excess permissions. May leave gaps if no clean role exists.',
    weights: {
      coverage: 2.0,
      excess: 5.0,
      roleCount: 0.1,
    },
    threshold: 0.1,
  },
  {
    name: 'Balanced',
    description: 'A middle ground that seeks coverage while avoiding large security risks.',
    weights: {
      coverage: 5.0,
      excess: 1.0,
      roleCount: 0.1,
    },
    threshold: 0,
  },
] as const;

export const ANALYSIS_CONSTANTS = {
  // Max number of roles the search may combine for a single identity.
  // Key Vault has 4 data-plane categories (keys/secrets/certificates/storage), so 4 is
  // enough to cover any policy even with single-category roles, while keeping the exhaustive
  // subset search bounded (the score also penalizes role count, so larger combos are never optimal).
  MAX_COMBINATION_SIZE: 4,
  GRAPH_BATCH_SIZE: 20,
  VAULT_CONCURRENCY_LIMIT: 5,
} as const;

export const UI_CONSTANTS = {
  PERMISSION_VISIBLE_LIMIT: 6,
  COPY_FEEDBACK_DURATION_MS: 2000,
} as const;

/** Identity type display order for grouping. */
export const IDENTITY_TYPE_ORDER = [
  'Application',
  'ServicePrincipal',
  'CompoundIdentity',
  'Group',
  'User',
  'Unknown',
] as const;

/** Strategy priority for tie-breaking equal-confidence recommendations. */
export const STRATEGY_PRIORITY: Record<string, number> = {
  'Minimize Excess': 3,
  'Balanced': 2,
  'Max Coverage': 1,
};
