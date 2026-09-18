const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticate } = require('../../src/middlewares/authenticate');
const { issueToken } = require('../../src/services/tokenService');
const { SESSION_COOKIE_NAME } = require('../../src/config/sessionCookie');
const { ROLES } = require('../../src/config/roles');

process.env.JWT_SECRET = 'secret-for-tests';

const IDENTITY = { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.ADMINISTRADOR };

function requestWith(cookies) {
  return { cookies };
}

test('authenticate attaches the identity carried by the session cookie', () => {
  const token = issueToken(IDENTITY, process.env.JWT_SECRET, '1h');
  const request = requestWith({ [SESSION_COOKIE_NAME]: token });
  let continued = false;

  authenticate(request, {}, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.deepEqual(request.identity, IDENTITY);
});

test('authenticate answers 401 when no session cookie was sent', () => {
  assert.throws(() => authenticate(requestWith({}), {}, () => {}), { statusCode: 401 });
  assert.throws(() => authenticate(requestWith(undefined), {}, () => {}), { statusCode: 401 });
  assert.throws(() => authenticate({}, {}, () => {}), { statusCode: 401 });
});

test('authenticate ignores a token sent in the Authorization header', () => {
  const token = issueToken(IDENTITY, process.env.JWT_SECRET, '1h');
  const request = { cookies: {}, headers: { authorization: `Bearer ${token}` } };

  assert.throws(() => authenticate(request, {}, () => {}), { statusCode: 401 });
});

test('authenticate answers 401 rather than 500 when the token is rejected', () => {
  const token = issueToken(IDENTITY, 'a-secret-this-api-does-not-use', '1h');

  assert.throws(() => authenticate(requestWith({ [SESSION_COOKIE_NAME]: token }), {}, () => {}), {
    statusCode: 401,
  });
});

test('authenticate does not continue the request when the token is rejected', () => {
  const request = requestWith({ [SESSION_COOKIE_NAME]: 'not-a-token' });
  let continued = false;

  assert.throws(() =>
    authenticate(request, {}, () => {
      continued = true;
    }),
  );

  assert.equal(continued, false);
  assert.equal(request.identity, undefined);
});
