const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticate, readBearerToken } = require('../../src/middlewares/authenticate');
const { issueToken } = require('../../src/services/tokenService');
const { ROLES } = require('../../src/config/roles');

process.env.JWT_SECRET = 'secret-for-tests';

const IDENTITY = { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.ADMINISTRADOR };

function requestWith(authorization) {
  return { headers: { authorization } };
}

test('readBearerToken takes the token out of a well formed header', () => {
  assert.equal(readBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
});

test('readBearerToken refuses a header it cannot trust', () => {
  assert.equal(readBearerToken(undefined), null);
  assert.equal(readBearerToken(''), null);
  assert.equal(readBearerToken('abc.def.ghi'), null);
  assert.equal(readBearerToken('Bearer'), null);
  assert.equal(readBearerToken('Bearer '), null);
  assert.equal(readBearerToken('bearer abc.def.ghi'), null);
  assert.equal(readBearerToken('Basic abc.def.ghi'), null);
  assert.equal(readBearerToken('Bearer abc.def.ghi extra'), null);
});

test('authenticate attaches the identity carried by a valid token', () => {
  const token = issueToken(IDENTITY, process.env.JWT_SECRET, '1h');
  const request = requestWith(`Bearer ${token}`);
  let continued = false;

  authenticate(request, {}, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.deepEqual(request.identity, IDENTITY);
});

test('authenticate answers 401 when the header carries no token', () => {
  assert.throws(() => authenticate(requestWith(undefined), {}, () => {}), { statusCode: 401 });
});

test('authenticate answers 401 rather than 500 when the token is rejected', () => {
  const token = issueToken(IDENTITY, 'a-secret-this-api-does-not-use', '1h');

  assert.throws(() => authenticate(requestWith(`Bearer ${token}`), {}, () => {}), {
    statusCode: 401,
  });
});

test('authenticate does not continue the request when the token is rejected', () => {
  const request = requestWith('Bearer not-a-token');
  let continued = false;

  assert.throws(() =>
    authenticate(request, {}, () => {
      continued = true;
    }),
  );

  assert.equal(continued, false);
  assert.equal(request.identity, undefined);
});
