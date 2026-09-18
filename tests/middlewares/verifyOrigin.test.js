const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyOrigin } = require('../../src/middlewares/verifyOrigin');

const ALLOWED_ORIGIN = 'https://cclu.example';

function requestFrom(method, origin) {
  return { method, headers: origin === undefined ? {} : { origin } };
}

function run(request) {
  let continued = false;

  verifyOrigin(
    request,
    {},
    () => {
      continued = true;
    },
    ALLOWED_ORIGIN,
  );

  return continued;
}

test('verifyOrigin lets a request from the allowed origin through', () => {
  assert.equal(run(requestFrom('POST', ALLOWED_ORIGIN)), true);
});

test('verifyOrigin refuses a state changing request from another origin', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(() => run(requestFrom(method, 'https://attacker.example')), {
      statusCode: 403,
    });
  }
});

test('verifyOrigin leaves reading alone, since it changes nothing', () => {
  assert.equal(run(requestFrom('GET', 'https://attacker.example')), true);
  assert.equal(run(requestFrom('HEAD', 'https://attacker.example')), true);
  assert.equal(run(requestFrom('OPTIONS', 'https://attacker.example')), true);
});

test('verifyOrigin allows a client that sends no origin, such as Postman', () => {
  assert.equal(run(requestFrom('POST', undefined)), true);
});

test('verifyOrigin refuses an origin that merely starts with the allowed one', () => {
  assert.throws(() => run(requestFrom('POST', `${ALLOWED_ORIGIN}.attacker.example`)), {
    statusCode: 403,
  });
});
