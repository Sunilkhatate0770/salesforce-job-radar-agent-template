import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENTS = new Map();
const EMPTY_TOKEN_VALUES = new Set(['', 'null', 'undefined', 'false']);

export class AuthSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthSessionError';
    this.code = code;
  }
}

function getGoogleClient(audience = process.env.GOOGLE_CLIENT_ID) {
  const key = String(audience || '').trim() || 'default';
  if (!GOOGLE_CLIENTS.has(key)) {
    GOOGLE_CLIENTS.set(key, new OAuth2Client(audience));
  }
  return GOOGLE_CLIENTS.get(key);
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return String(value || '');
}

export function extractBearerToken(reqOrHeaders = {}) {
  const headers = reqOrHeaders.headers || reqOrHeaders || {};
  const raw = normalizeHeaderValue(headers.authorization || headers.Authorization);
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  const token = raw.slice(7).trim();
  return EMPTY_TOKEN_VALUES.has(token.toLowerCase()) ? null : token;
}

export function normalizeGoogleUser(payload = {}) {
  const id = String(payload.sub || payload.googleId || payload.id || '').trim();
  if (!id) {
    throw new AuthSessionError('missing_subject', 'Google token did not include a user subject.');
  }
  return {
    id,
    googleId: id,
    email: String(payload.email || '').trim(),
    name: String(payload.name || payload.email || 'Salesforce Candidate').trim(),
    picture: String(payload.picture || '').trim()
  };
}

export async function verifyGoogleCredential(token, options = {}) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken || EMPTY_TOKEN_VALUES.has(normalizedToken.toLowerCase())) {
    throw new AuthSessionError('missing_token', 'Missing Google ID token.');
  }

  const audience = String(options.audience || process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!audience) {
    throw new AuthSessionError('missing_google_client_id', 'GOOGLE_CLIENT_ID is not configured.');
  }

  const verifier = options.client || getGoogleClient(audience);
  const ticket = await verifier.verifyIdToken({
    idToken: normalizedToken,
    audience
  });
  const payload = ticket.getPayload();
  const user = normalizeGoogleUser(payload);

  return {
    token: normalizedToken,
    payload,
    user,
    userId: user.id
  };
}

export async function getAuthenticatedUser(req, options = {}) {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    return await verifyGoogleCredential(token, options);
  } catch (err) {
    if (options.log !== false) {
      console.warn('[AUTH] Google token verification failed:', err.message);
    }
    return null;
  }
}

export async function getAuthenticatedUserId(req, options = {}) {
  const session = await getAuthenticatedUser(req, options);
  return session?.userId || null;
}
