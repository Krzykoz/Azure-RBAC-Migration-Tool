import {
  AccessPolicyEntry,
  MigrationAnalysis,
  RoleDefinition,
  SuggestedRole,
  RoleAssignment,
  ExistingCoverageResult,
} from '../types';
import { StrategyConfig } from '../constants';
import { defaultPermissionCatalog } from './analysis/permissionCatalog';
import * as engine from './analysis/engine';
import { runWeightedAnalysis as runWeightedAnalysisWithCatalog } from './analysis/strategies';

/**
 * Public analysis API. This is a thin facade over the `./analysis/*` engine,
 * binding the default (CSV-backed) permission catalog so existing callers need
 * no wiring. The underlying engine accepts an injected `PermissionCatalog`,
 * which keeps the matching/coverage/strategy logic independently testable.
 */

export const analyzePolicies = (
  policies: AccessPolicyEntry[],
  availableRoles: RoleDefinition[]
): MigrationAnalysis[] => engine.analyzePolicies(policies, availableRoles, defaultPermissionCatalog);

export const analyzeExistingCoverage = (
  policy: AccessPolicyEntry,
  assignments: RoleAssignment[],
  availableRoles: RoleDefinition[],
  scopeFilter?: string
): ExistingCoverageResult =>
  engine.analyzeExistingCoverage(
    policy,
    assignments,
    availableRoles,
    scopeFilter,
    defaultPermissionCatalog
  );

export const runWeightedAnalysis = (
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig
): SuggestedRole => runWeightedAnalysisWithCatalog(required, roles, config, defaultPermissionCatalog);
