/**
 * Minimal JWT inspection: the app never validates tokens, it only reads display
 * claims (name, tenant) out of tokens the user pasted.
 */

/** Decode a JWT payload with URL-safe base64 and UTF-8 handling. */
export const decodeJWTPayload = (token: string): any => {
  // Convert URL-safe base64 to regular base64
  const base64 = token.split('.')[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);

  // Decode with proper UTF-8 handling
  const binaryString = atob(padded);
  const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

/** The user's display name from a token, or 'Azure User' if extraction fails. */
export const getUserNameFromToken = (token: string): string => {
  try {
    const payload = decodeJWTPayload(token);
    return payload.name ||
      payload.upn ||
      payload.unique_name ||
      payload.preferred_username ||
      payload.email ||
      'Azure User';
  } catch (e) {
    console.error('Failed to parse token:', e);
    return 'Azure User';
  }
};

/** The tenant ID (tid claim) from a token, or null if extraction fails. */
export const getTenantIdFromToken = (token: string): string | null => {
  try {
    const payload = decodeJWTPayload(token);
    return payload.tid || null;
  } catch (e) {
    console.error('Failed to parse token for tenant ID:', e);
    return null;
  }
};
