const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../../src/middlewares/authorize');
const { ROLES } = require('../../src/config/roles');

function requestFor(role) {
  return { identity: { id: '65f0c3a1b2c3d4e5f6a7b8c9', role } };
}

test('authorize continues the request for a role it was given', () => {
  const request = requestFor(ROLES.ADMINISTRADOR);
  let continued = false;

  authorize(ROLES.ADMINISTRADOR)(request, {}, () => {
    continued = true;
  });

  assert.equal(continued, true);
});

test('authorize accepts any one of several allowed roles', () => {
  let continued = 0;
  const middleware = authorize(ROLES.AGREMIADO, ROLES.ADMINISTRADOR);

  middleware(requestFor(ROLES.AGREMIADO), {}, () => {
    continued += 1;
  });
  middleware(requestFor(ROLES.ADMINISTRADOR), {}, () => {
    continued += 1;
  });

  assert.equal(continued, 2);
});

test('authorize answers 403 when the role is not allowed', () => {
  assert.throws(() => authorize(ROLES.ADMINISTRADOR)(requestFor(ROLES.AGREMIADO), {}, () => {}), {
    statusCode: 403,
  });
});

test('authorize answers 401 when the request was never authenticated', () => {
  assert.throws(() => authorize(ROLES.ADMINISTRADOR)({}, {}, () => {}), { statusCode: 401 });
});

test('authorize does not continue a request it rejects', () => {
  let continued = false;

  assert.throws(() =>
    authorize(ROLES.ADMINISTRADOR)(requestFor(ROLES.AGREMIADO), {}, () => {
      continued = true;
    }),
  );

  assert.equal(continued, false);
});
