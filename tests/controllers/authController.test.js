const test = require('node:test');
const assert = require('node:assert/strict');
const authController = require('../../src/controllers/authController');
const { SESSION_COOKIE_NAME } = require('../../src/config/sessionCookie');
const { ROLES } = require('../../src/config/roles');

process.env.JWT_SECRET = 'secret-for-tests';
process.env.JWT_EXPIRES_IN = '1h';

function responseSpy() {
  const sent = { cookies: [], cleared: [], status: null, body: undefined, ended: false };

  return {
    sent,
    cookie(name, value, options) {
      sent.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      sent.cleared.push({ name, options });
      return this;
    },
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
    end() {
      sent.ended = true;
      return this;
    },
  };
}

function requestWith(body) {
  return { body, originalUrl: '/api/auth/admin/login', ip: '203.0.113.7' };
}

test('signInAdmin answers 204 and puts the session in a cookie, never in the body', async () => {
  const response = responseSpy();

  await authController.signInAdmin(
    requestWith({ email: 'a@b.cr', password: 'x' }),
    response,
    () => {},
    async () => ({
      id: '65f0c3a1b2c3d4e5f6a7b8c9',
      role: ROLES.ADMIN,
    }),
  );

  assert.equal(response.sent.status, 204);
  assert.equal(response.sent.body, undefined);
  assert.equal(response.sent.cookies.length, 1);
  assert.equal(response.sent.cookies[0].name, SESSION_COOKIE_NAME);
  assert.equal(response.sent.cookies[0].options.httpOnly, true);
});

test('signInAdmin answers 401 and sets no cookie when the credentials are refused', async () => {
  const response = responseSpy();

  await assert.rejects(
    authController.signInAdmin(
      requestWith({ email: 'a@b.cr', password: 'x' }),
      response,
      () => {},
      async () => null,
    ),
    { statusCode: 401 },
  );

  assert.equal(response.sent.cookies.length, 0);
  assert.equal(response.sent.status, null);
});

test('signOut clears the cookie without asking who is asking', async () => {
  const response = responseSpy();

  await authController.signOut({}, response);

  assert.equal(response.sent.cleared.length, 1);
  assert.equal(response.sent.cleared[0].name, SESSION_COOKIE_NAME);
  assert.equal(response.sent.status, 204);
});

test('getCurrentIdentity answers with the identity the token carried', async () => {
  const response = responseSpy();
  const identity = { id: 'abc', role: ROLES.ADMIN };

  await authController.getCurrentIdentity({ identity }, response);

  assert.deepEqual(response.sent.body, identity);
});
