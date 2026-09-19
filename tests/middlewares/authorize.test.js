const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../../src/middlewares/authorize');
const { ROLES } = require('../../src/config/roles');

function requestFor(role) {
  return { identity: { id: '65f0c3a1b2c3d4e5f6a7b8c9', role } };
}

test('authorize continues the request for a role it was given', () => {
  const request = requestFor(ROLES.ADMIN);
  let continued = false;

  authorize(ROLES.ADMIN)(request, {}, () => {
    continued = true;
  });

  assert.equal(continued, true);
});

test('authorize accepts any one of several allowed roles', () => {
  let continued = 0;
  const middleware = authorize(ROLES.MEMBER, ROLES.ADMIN);

  middleware(requestFor(ROLES.MEMBER), {}, () => {
    continued += 1;
  });
  middleware(requestFor(ROLES.ADMIN), {}, () => {
    continued += 1;
  });

  assert.equal(continued, 2);
});

test('authorize answers 403 when the role is not allowed', () => {
  assert.throws(() => authorize(ROLES.ADMIN)(requestFor(ROLES.MEMBER), {}, () => {}), {
    statusCode: 403,
  });
});

test('authorize answers 401 when the request was never authenticated', () => {
  assert.throws(() => authorize(ROLES.ADMIN)({}, {}, () => {}), { statusCode: 401 });
});

test('authorize does not continue a request it rejects', () => {
  let continued = false;

  assert.throws(() =>
    authorize(ROLES.ADMIN)(requestFor(ROLES.MEMBER), {}, () => {
      continued = true;
    }),
  );

  assert.equal(continued, false);
});
