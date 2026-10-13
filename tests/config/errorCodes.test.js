const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ERROR_CODES, ApplicationError, isRegisteredCode } = require('../../src/config/errorCodes');

const SNAKE_CASE = /^[a-z]+(_[a-z]+)*$/;

test('every registered code is snake_case and named by its own upper case', () => {
  for (const [name, code] of Object.entries(ERROR_CODES)) {
    assert.match(code, SNAKE_CASE);
    assert.equal(name, code.toUpperCase());
  }
});

test('the registry is the JSON file other repositories read', () => {
  const published = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'src', 'config', 'errorCodes.json'), 'utf8'),
  );

  assert.deepEqual(ERROR_CODES, published);
});

test('the registry keeps the codes clients already decide on', () => {
  for (const code of [
    'required',
    'not_text',
    'too_long',
    'invalid_format',
    'not_allowed',
    'unknown_reference',
    'password_too_short',
    'password_too_long',
    'password_needs_letter',
    'password_needs_digit',
    'password_needs_special',
    'nothing_to_change',
    'already_registered',
    'invalid_current_password',
    'invalid_code',
    'body_missing',
  ]) {
    assert.equal(isRegisteredCode(code), true, code);
  }
});

test('the registry cannot be changed at run time', () => {
  assert.throws(() => {
    'use strict';
    ERROR_CODES.REQUIRED = 'something_else';
  }, TypeError);
});

test('an application error carries its code, status, field and message', () => {
  const error = new ApplicationError(ERROR_CODES.TOO_LONG, 'Too long.', {
    statusCode: 422,
    field: 'phone',
  });

  assert.equal(error instanceof Error, true);
  assert.equal(error.code, 'too_long');
  assert.equal(error.statusCode, 422);
  assert.equal(error.field, 'phone');
  assert.equal(error.message, 'Too long.');
});

test('an application error is a 400 about no field unless told otherwise', () => {
  const error = new ApplicationError(ERROR_CODES.BODY_MISSING, 'The body is missing.');

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, null);
  assert.equal(error.name, 'ApplicationError');
});

test('an application error keeps the name and reason it is given', () => {
  const error = new ApplicationError(ERROR_CODES.AUTHENTICATION_REQUIRED, 'Sign in.', {
    statusCode: 401,
    name: 'Unauthorized',
    reason: 'expired',
  });

  assert.equal(error.name, 'Unauthorized');
  assert.equal(error.reason, 'expired');
});

// A code the web has no sentence for reaches a person as the generic message,
// so an unregistered one is a mistake to catch while writing it.
test('an application error refuses a code that is not registered', () => {
  assert.throws(() => new ApplicationError('made_up_code', 'Nope.'), TypeError);
  assert.throws(() => new ApplicationError(undefined, 'Nope.'), TypeError);
});
