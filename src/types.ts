
export enum MigrationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export type IdentityType = 'User' | 'Group' | 'Application' | 'ServicePrincipal' | 'Unknown';

export interface Subscription {
  id: string;
  displayName: string;
  subscriptionId: string;
}

export interface KeyVault {
  id: string;
  name: string;
  location: string;
  sku: string; // 'Standard' | 'Premium' | unknown
  accessPolicies: AccessPolicyEntry[];
}

export interface AccessPolicyEntry {
  tenantId: string;
  objectId: string;
  applicationId?: string;
  displayName?: string; // Can be populated if we have Graph access, otherwise generic
  type: IdentityType;
  permissions: {
    keys?: string[];
    secrets?: string[];
    certificates?: string[];
    storage?: string[];
  };
}

export interface RolePermission {
  actions: string[];
  notActions: string[];
  dataActions: string[];
  notDataActions: string[];
}

export interface RoleDefinition {
  id: string;
  name: string; // GUID
  type: string;
  properties: {
    roleName: string;
    description: string;
    type: string; // 'BuiltInRole' | 'CustomRole'
    permissions: RolePermission[];
    assignableScopes: string[];
  };
}

export interface RoleAssignment {
  id: string;
  name: string; // GUID
  type: string;
  properties: {
    roleDefinitionId: string;
    principalId: string;
    principalType: string; // 'User' | 'Group' | 'ServicePrincipal'
    scope: string;
  };
}

export interface RoleBreakdown {
  roleName: string;
  covered: string[];
  excess: string[];
}

export interface SuggestedRole {
  strategy: string; // 'Max Coverage' | 'Min Excess' | 'Balanced'
  roleName: string; // Combined display name
  roleNames: string[]; // Individual role names
  confidence: number; // 0-100
  reasoning: string;
  coveredPermissions: string[]; // Permissions from original policy that this role covers
  missingPermissions: string[]; // Permissions from original policy that this role DOES NOT cover
  excessPermissions: string[]; // Permissions this role has that were not in original policy
  roleBreakdown: RoleBreakdown[]; // Detailed attribution of permissions to specific roles
}

export interface MigrationAnalysis {
  originalPolicy: AccessPolicyEntry;
  recommendations: SuggestedRole[]; // Ordered by confidence
  existingCoverage?: ExistingCoverageResult;
}

export interface ExistingCoverageResult {
  isFullyCovered: boolean;
  coveredPermissions: string[];
  missingPermissions: string[];
  excessPermissions: string[]; // Permissions the user has via RBAC that weren't in the policy
  roleMatches: Array<{
    roleName: string;
    covered: string[];
    excess: string[];
  }>;
}