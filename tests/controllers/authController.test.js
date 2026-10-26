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
  const signedIn = [];

  await authController.signInAdmin(
    requestWith({ email: 'a@b.cr', password: 'x' }),
    response,
    () => {},
    async () => ({
      outcome: 'authenticated',
      identity: {
        id: '65f0c3a1b2c3d4e5f6a7b8c9',
        role: ROLES.ADMIN,
      },
    }),
    async (adminId) => signedIn.push(adminId),
  );

  assert.deepEqual(signedIn, ['65f0c3a1b2c3d4e5f6a7b8c9']);
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
      async () => ({ outcome: 'invalid_credentials' }),
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

test('getCurrentIdentity answers with the account, not only the token payload', async () => {
  const response = responseSpy();
  const identity = { id: 'abc', role: ROLES.ADMIN };
  const describe = async () => ({
    ...identity,
    email: 'admin@cclu.cr',
    displayName: 'admin@cclu.cr',
  });

  await authController.getCurrentIdentity({ identity }, response, undefined, describe);

  assert.equal(response.sent.body.email, 'admin@cclu.cr');
  assert.equal(response.sent.body.role, ROLES.ADMIN);
});

// The gate above already proved the account was usable, so nothing here means
// it disappeared between the two and the session is worth nothing.
test('getCurrentIdentity refuses a session whose account no longer exists', async () => {
  const response = responseSpy();

  await assert.rejects(
    () =>
      authController.getCurrentIdentity(
        { identity: { id: 'abc', role: ROLES.ADMIN } },
        response,
        undefined,
        async () => null,
      ),
    (error) => error.statusCode === 401,
  );
});

test('a refused sign in carries the invalid_credentials code', async () => {
  await assert.rejects(
    authController.signInAdmin(
      requestWith({ email: 'a@b.cr', password: 'x' }),
      responseSpy(),
      () => {},
      async () => ({ outcome: 'invalid_credentials' }),
    ),
    { code: 'invalid_credentials' },
  );
});

// The state is the code, so a screen picks its sentence from the catalog like
// any other error; the reason stays for clients that already read it.
test('a member refused for the state of their account carries that state as the code', async () => {
  for (const outcome of ['application_pending', 'application_rejected', 'account_suspended']) {
    await assert.rejects(
      authController.signInMember(
        requestWith({ email: 'a@b.cr', password: 'x' }),
        responseSpy(),
        () => {},
        async () => ({ outcome }),
      ),
      { statusCode: 403, code: outcome, reason: outcome },
    );
  }
});

test('an administrator refused for the state of their account carries that state too', async () => {
  for (const outcome of ['invitation_pending', 'invitation_expired', 'account_inactive']) {
    await assert.rejects(
      authController.signInAdmin(
        requestWith({ email: 'a@b.cr', password: 'x' }),
        responseSpy(),
        () => {},
        async () => ({ outcome }),
      ),
      { statusCode: 403, code: outcome, reason: outcome },
    );
  }
});

// Two clocks are set from one answer, so the cookie cannot outlive the token it
// carries, and a session nobody asked to keep dies with the browser.
test('a session asked to outlive the browser is given a clock, and one that is not is not', async () => {
  const jwt = require('jsonwebtoken');
  const remembered = responseSpy();
  const plain = responseSpy();
  const signIn = (body, response) =>
    authController.signInAdmin(
      requestWith(body),
      response,
      () => {},
      async () => ({
        outcome: 'authenticated',
        identity: { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.ADMIN },
      }),
      async () => {},
    );

  await signIn({ email: 'a@b.cr', password: 'x', rememberSession: true }, remembered);
  await signIn({ email: 'a@b.cr', password: 'x', rememberSession: false }, plain);

  const rememberedCookie = remembered.sent.cookies[0].options;
  const plainCookie = plain.sent.cookies[0].options;

  assert.ok(rememberedCookie.maxAge > 0, 'the remembered cookie carries no clock');
  assert.equal(plainCookie.maxAge, undefined, 'a session nobody asked to keep was given a clock');

  const rememberedSpan =
    jwt.decode(remembered.sent.cookies[0].value).exp -
    jwt.decode(remembered.sent.cookies[0].value).iat;
  const plainSpan =
    jwt.decode(plain.sent.cookies[0].value).exp - jwt.decode(plain.sent.cookies[0].value).iat;

  assert.ok(
    rememberedSpan > plainSpan,
    'the remembered token was not signed for longer than the ordinary one',
  );
});
