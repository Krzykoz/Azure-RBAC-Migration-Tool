import { describe, it, expect } from 'vitest';
import {
  isCompoundIdentity,
  resolveIdentityType,
  displayIdentityType,
  resolveAppName,
  describeIdentity,
  ResolvedNames,
} from '../identity';
import { makePolicy } from '../../test/factories';

const names: ResolvedNames = {
  sp1: { name: 'MySP', type: 'ServicePrincipal' },
  app1: { name: 'MyApp', type: 'Application' },
  u1: { name: 'Alice', type: 'User' },
};

describe('isCompoundIdentity', () => {
  it('is true only for a non-empty applicationId', () => {
    expect(isCompoundIdentity(makePolicy({}, { applicationId: 'app1' }))).toBe(true);
    expect(isCompoundIdentity(makePolicy({}, { applicationId: '' }))).toBe(false);
    expect(isCompoundIdentity(makePolicy({}, { applicationId: '   ' }))).toBe(false);
    expect(isCompoundIdentity(makePolicy({}, { applicationId: undefined }))).toBe(false);
  });
});

describe('resolveIdentityType', () => {
  it('prefers resolved type, then policy type, then Unknown', () => {
    expect(resolveIdentityType(makePolicy({}, { objectId: 'u1', type: 'Unknown' }), names)).toBe('User');
    expect(resolveIdentityType(makePolicy({}, { objectId: 'x', type: 'Group' }), names)).toBe('Group');
    expect(resolveIdentityType(makePolicy({}, { objectId: 'x', type: 'Unknown' }), names)).toBe('Unknown');
  });
});

describe('displayIdentityType', () => {
  it('collapses compound identities to the Compound Identity label', () => {
    expect(
      displayIdentityType(makePolicy({}, { objectId: 'sp1', applicationId: 'app1' }), names)
    ).toBe('Compound Identity');
  });

  it('returns the resolved type for non-compound identities', () => {
    expect(displayIdentityType(makePolicy({}, { objectId: 'u1', type: 'Unknown' }), names)).toBe('User');
  });
});

describe('resolveAppName', () => {
  it('resolves the app name, falling back to the raw appId', () => {
    expect(resolveAppName(makePolicy({}, { applicationId: 'app1' }), names)).toBe('MyApp');
    expect(resolveAppName(makePolicy({}, { applicationId: 'unknown-app' }), names)).toBe('unknown-app');
  });

  it('returns undefined for non-compound identities', () => {
    expect(resolveAppName(makePolicy({}, { applicationId: '' }), names)).toBeUndefined();
  });
});

describe('describeIdentity', () => {
  it('appends "on behalf of (App)" for compound identities', () => {
    const d = describeIdentity(makePolicy({}, { objectId: 'sp1', applicationId: 'app1' }), names);
    expect(d.displayName).toBe('MySP on behalf of (MyApp)');
    expect(d.isCompound).toBe(true);
    expect(d.appName).toBe('MyApp');
    expect(d.type).toBe('ServicePrincipal');
  });

  it('leaves displayName undefined for unresolved identities without a fallback', () => {
    const d = describeIdentity(makePolicy({}, { objectId: 'ghost', type: 'Unknown' }), names);
    expect(d.displayName).toBeUndefined();
  });

  it('applies the fallback name and still suffixes compound identities (export behavior)', () => {
    const d = describeIdentity(
      makePolicy({}, { objectId: 'ghost', applicationId: 'app1' }),
      names,
      { fallbackName: 'Unknown' }
    );
    expect(d.displayName).toBe('Unknown on behalf of (MyApp)');
  });

  it('does not suffix an unresolved compound identity when no fallback is given (UI behavior)', () => {
    const d = describeIdentity(makePolicy({}, { objectId: 'ghost', applicationId: 'app1' }), names);
    expect(d.displayName).toBeUndefined();
  });
});
