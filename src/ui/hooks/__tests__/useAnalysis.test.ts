import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useAnalysis } from '../useAnalysis';
import { makePolicy, makeRole, ACTIONS } from '../../../testing/factories';
import { getPolicyKey } from '../../../core/identity/policyKey';
import { AccessPolicyEntry, RoleDefinition } from '../../../core/types';
import { Checkbox } from '../../primitives/Checkbox';
import { CopyableCommand } from '../../primitives/CopyableCommand';

function renderAnalysis(policy: AccessPolicyEntry, roles: RoleDefinition[]) {
  function Harness() {
    const analysis = useAnalysis({
      selectedVault: { id: '/vaults/v', name: 'v', location: 'test', sku: 'Standard', accessPolicies: [policy] },
      availableRoles: roles,
      roleAssignments: [],
      resolvedNames: {},
      includeCustomRoles: true,
    });
    if (analysis.results.length === 0) analysis.runAnalysis();
    const result = analysis.results[0];
    const selected = result?.recommendations[analysis.selectedRoles[getPolicyKey(policy)]];
    return createElement('span', null, selected ? `${selected.confidence}:${selected.excessPermissions.length}` : 'pending');
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe('analysis execution', () => {
  it('publishes results synchronously, with no delayed callback left for another vault', () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    try {
      expect(renderAnalysis(makePolicy({ secrets: ['Get'] }), [makeRole('Get', [ACTIONS.SECRET_GET])]))
        .toBe('<span>100:0</span>');
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it('propagates invalid permissions to the caller instead of leaving a pending promise', () => {
    expect(() => renderAnalysis(makePolicy({ secrets: ['constructor'] }), []))
      .toThrow(/Unsupported permission/);
  });

  it('selects complete coverage with least excess regardless of merged strategy labels', () => {
    const required = ['decrypt/action', 'encrypt/action', 'sign/action'].map((action) => `Microsoft.KeyVault/vaults/keys/${action}`);
    const roles = [
      makeRole('Broad', [...required, 'Microsoft.KeyVault/vaults/keys/delete']),
      ...required.map((action) => makeRole(action, [action])),
    ];
    expect(renderAnalysis(makePolicy({ keys: ['Decrypt', 'Encrypt', 'Sign'] }), roles))
      .toBe('<span>100:0</span>');
  });
});

it('names selection controls and makes copy commands native buttons', () => {
  expect(renderToStaticMarkup(createElement(Checkbox, { label: 'Select Alice', checked: false, onChange() {} })))
    .toContain('aria-label="Select Alice"');
  expect(renderToStaticMarkup(createElement(CopyableCommand, { command: 'az login', commandId: 'login' })))
    .toMatch(/^<button type="button" aria-label="Copy command: az login"/);
});
