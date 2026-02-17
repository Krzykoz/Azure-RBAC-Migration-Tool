import { MigrationAnalysis, IdentityType, AccessPolicyEntry } from '../types';

/**
 * Gets the resolved display name for an identity, handling compound identities
 * (service principals acting on behalf of applications)
 */
export const getResolvedDisplayName = (
    policy: AccessPolicyEntry,
    resolvedNames: Record<string, { name: string; type: IdentityType }>
): string => {
    const resolvedInfo = resolvedNames[policy.objectId];
    let displayName = resolvedInfo?.name || policy.displayName || 'Unknown';
    
    const hasAppId = policy.applicationId && policy.applicationId.trim() !== '';
    if (hasAppId) {
        const appInfo = resolvedNames[policy.applicationId!];
        const appName = appInfo?.name || policy.applicationId;
        displayName = `${displayName} on behalf of (${appName})`;
    }
    
    return displayName;
};

/**
 * Gets the identity type, with special handling for compound identities
 */
export const getIdentityType = (
    policy: AccessPolicyEntry,
    resolvedNames: Record<string, { name: string; type: IdentityType }>
): string => {
    const hasAppId = policy.applicationId && policy.applicationId.trim() !== '';
    if (hasAppId) {
        return 'Compound Identity';
    }
    
    const resolvedInfo = resolvedNames[policy.objectId];
    return resolvedInfo?.type || policy.type || 'Unknown';
};

/**
 * Gets the application name for compound identities
 */
export const getApplicationName = (
    policy: AccessPolicyEntry,
    resolvedNames: Record<string, { name: string; type: IdentityType }>
): string | undefined => {
    const hasAppId = policy.applicationId && policy.applicationId.trim() !== '';
    if (!hasAppId) {
        return undefined;
    }
    
    const appInfo = resolvedNames[policy.applicationId!];
    return appInfo?.name || policy.applicationId;
};

/**
 * Filters analysis results to get only exportable identities (non-Unknown types)
 */
export const getExportableIdentities = (
    analysis: MigrationAnalysis[],
    resolvedNames: Record<string, { name: string; type: IdentityType }>
): Set<string> => {
    const exportIds = new Set<string>();
    
    analysis.forEach((a) => {
        const resolvedType = resolvedNames[a.originalPolicy.objectId]?.type;
        const policyType = a.originalPolicy.type;
        const type = resolvedType || policyType || 'Unknown';
        
        if (type !== 'Unknown') {
            exportIds.add(a.originalPolicy.objectId);
        }
    });
    
    return exportIds;
};
