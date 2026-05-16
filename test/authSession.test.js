import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuthSessionError,
  extractBearerToken,
  getAuthenticatedUserId,
  normalizeGoogleUser,
  verifyGoogleCredential
} from '../src/auth/session.js';
import {
  apiError,
  apiSuccess,
  unauthorizedResponse
} from '../src/api/apiResponse.js';

function fakeGoogleClient(payload, recorder = {}) {
  return {
    async verifyIdToken(args) {
      recorder.args = args;
      return {
        getPayload() {
          return payload;
        }
      };
    }
  };
}

test('session helper extracts only usable bearer tokens', () => {
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer abc.def' } }), 'abc.def');
  assert.equal(extractBearerToken({ Authorization: 'Bearer xyz' }), 'xyz');
  assert.equal(extractBearerToken({ headers: { authorization: 'Basic abc' } }), null);
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer null' } }), null);
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer undefined' } }), null);
});

test('session helper normalizes Google payload into stable app user shape', () => {
  assert.deepEqual(
    normalizeGoogleUser({
      sub: 'google-123',
      email: 'dev@example.com',
      name: 'Salesforce Dev',
      picture: 'https://example.com/me.png'
    }),
    {
      id: 'google-123',
      googleId: 'google-123',
      email: 'dev@example.com',
      name: 'Salesforce Dev',
      picture: 'https://example.com/me.png'
    }
  );

  assert.throws(
    () => normalizeGoogleUser({ email: 'missing-sub@example.com' }),
    AuthSessionError
  );
});

test('session helper verifies Google token without trusting client userId', async () => {
  const recorder = {};
  const session = await verifyGoogleCredential('token-123', {
    audience: 'google-client-id',
    client: fakeGoogleClient({ sub: 'server-user', email: 'server@example.com' }, recorder)
  });

  assert.equal(recorder.args.idToken, 'token-123');
  assert.equal(recorder.args.audience, 'google-client-id');
  assert.equal(session.userId, 'server-user');
  assert.equal(session.user.googleId, 'server-user');
});

test('authenticated request helper returns null on invalid tokens', async () => {
  const userId = await getAuthenticatedUserId(
    { headers: { authorization: 'Bearer bad-token' } },
    {
      audience: 'google-client-id',
      log: false,
      client: {
        async verifyIdToken() {
          throw new Error('invalid');
        }
      }
    }
  );

  assert.equal(userId, null);
});

test('API response helper keeps consistent success and error envelopes', () => {
  assert.deepEqual(apiSuccess({ user: { id: 'u1' } }), {
    success: true,
    user: { id: 'u1' }
  });

  assert.deepEqual(unauthorizedResponse(), {
    success: false,
    error: 'Unauthorized',
    code: 'unauthorized'
  });

  assert.deepEqual(apiError('Nope', { status: 400, code: 'bad_request' }), {
    success: false,
    error: 'Nope',
    code: 'bad_request'
  });
});
