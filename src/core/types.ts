/**
 * Domain model shared across the whole app: Azure resources as the app sees
 * them, plus the analysis result shapes produced by the engine.
 */

export enum MigrationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export type IdentityType = 'User' | 'Group' | 'Application' | 'ServicePrincipal' | 'Unknown';

export interface Subscription {
  id: string;
  displayName: string;
  subscriptionId: string;
}

export interface AccessPolicyEntry {
  tenantId: string;
  objectId: string;
  applicationId?: string;
  /** Populated when Graph access is available; otherwise absent. */
  displayName?: string;
  type: IdentityType;
  permissions: {
    keys?: string[];
    secrets?: string[];
    certificates?: string[];
    storage?: string[];
  };
}

export interface KeyVault {
  id: string;
  name: string;
  location: string;
  /** 'Standard' | 'Premium' | unknown */
  sku: string;
  accessPolicies: AccessPolicyEntry[];
}

export interface RolePermission {
  actions: string[];
  notActions: string[];
  dataActions: string[];
  notDataActions: string[];
}

export interface RoleDefinition {
  id: string;
  /** GUID */
  name: string;
  type: string;
  properties: {
    roleName: string;
    description: string;
    /** 'BuiltInRole' | 'CustomRole' */
    type: string;
    permissions: RolePermission[];
    assignableScopes: string[];
  };
}

export interface RoleAssignment {
  id: string;
  /** GUID */
  name: string;
  type: string;
  properties: {
    roleDefinitionId: string;
    principalId: string;
    /** 'User' | 'Group' | 'ServicePrincipal' */
    principalType: string;
    scope: string;
  };
}

/** Per-role attribution of which permissions it covers and which it over-grants. */
export interface RoleBreakdown {
  roleName: string;
  covered: string[];
  excess: string[];
}

export interface SuggestedRole {
  /** 'Max Coverage' | 'Minimize Excess' | 'Balanced' (or a merged label). */
  strategy: string;
  /** Combined display name, e.g. "Role A + Role B". */
  roleName: string;
  roleNames: string[];
  /** 0-100; reflects coverage only. */
  confidence: number;
  reasoning: string;
  /** Required actions this role set covers. */
  coveredPermissions: string[];
  /** Required actions this role set does NOT cover. */
  missingPermissions: string[];
  /** Actions granted beyond the requirement. */
  excessPermissions: string[];
  roleBreakdown: RoleBreakdown[];
}

export interface ExistingCoverageResult {
  isFullyCovered: boolean;
  coveredPermissions: string[];
  missingPermissions: string[];
  /** Permissions already granted via RBAC that weren't in the policy. */
  excessPermissions: string[];
  roleMatches: Array<{
    roleName: string;
    covered: string[];
    excess: string[];
  }>;
}

export interface MigrationAnalysis {
  originalPolicy: AccessPolicyEntry;
  /** Ordered per-strategy recommendations (deduplicated where strategies agree). */
  recommendations: SuggestedRole[];
  existingCoverage?: ExistingCoverageResult;
}
