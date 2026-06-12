import { describe, it, expect } from 'vitest';
import { decodeJWTPayload, getUserNameFromToken, getTenantIdFromToken } from '../jwt';

const makeToken = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
};

describe('decodeJWTPayload', () => {
  it('decodes a URL-safe base64 payload, including UTF-8 names', () => {
    const token = makeToken({ name: 'Renée Müller', tid: 'tenant-9' });
    expect(decodeJWTPayload(token)).toMatchObject({ name: 'Renée Müller', tid: 'tenant-9' });
  });
});

describe('getUserNameFromToken', () => {
  it('prefers the name claim', () => {
    expect(getUserNameFromToken(makeToken({ name: 'Alice', upn: 'a@x.com' }))).toBe('Alice');
  });

  it('falls back through upn → unique_name → preferred_username → email', () => {
    expect(getUserNameFromToken(makeToken({ upn: 'u@x.com' }))).toBe('u@x.com');
    expect(getUserNameFromToken(makeToken({ unique_name: 'uniq' }))).toBe('uniq');
    expect(getUserNameFromToken(makeToken({ preferred_username: 'pref' }))).toBe('pref');
    expect(getUserNameFromToken(makeToken({ email: 'e@x.com' }))).toBe('e@x.com');
  });

  it('returns "Azure User" when no name-like claim exists or the token is malformed', () => {
    expect(getUserNameFromToken(makeToken({ sub: 'only-sub' }))).toBe('Azure User');
    expect(getUserNameFromToken('garbage')).toBe('Azure User');
  });
});

describe('getTenantIdFromToken', () => {
  it('returns the tid claim', () => {
    expect(getTenantIdFromToken(makeToken({ tid: 'tenant-9' }))).toBe('tenant-9');
  });

  it('returns null when tid is absent or the token is malformed', () => {
    expect(getTenantIdFromToken(makeToken({ name: 'no-tid' }))).toBeNull();
    expect(getTenantIdFromToken('not-a-jwt')).toBeNull();
  });
});
