const test = require('node:test');
const assert = require('node:assert/strict');
const errorHandler = require('../../src/middlewares/errorHandler');
const { ApplicationError, ERROR_CODES } = require('../../src/config/errorCodes');

function responseSpy() {
  const sent = { status: null, body: undefined };

  return {
    sent,
    headersSent: false,
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
  };
}

function handle(error) {
  const response = responseSpy();
  const originalError = console.error;
  console.error = () => {};

  try {
    errorHandler(error, {}, response, () => {});
  } finally {
    console.error = originalError;
  }

  return response.sent;
}

test('a client error answers with its code, field and message', () => {
  const sent = handle(
    new ApplicationError(ERROR_CODES.TOO_LONG, 'Too long.', { field: 'phone', name: 'X' }),
  );

  assert.equal(sent.status, 400);
  assert.deepEqual(sent.body, {
    error: 'X',
    message: 'Too long.',
    code: 'too_long',
    field: 'phone',
  });
});

test('a client error with no field answers without one', () => {
  const sent = handle(new ApplicationError(ERROR_CODES.BODY_MISSING, 'Missing.'));

  assert.equal('field' in sent.body, false);
  assert.equal(sent.body.code, 'body_missing');
});

test('a client error keeps the reason it carries', () => {
  const sent = handle(
    new ApplicationError(ERROR_CODES.ALREADY_DECIDED, 'Decided.', {
      statusCode: 409,
      reason: 'approved',
    }),
  );

  assert.equal(sent.body.reason, 'approved');
});

test('a server error answers the generic code and hides its detail', () => {
  const failure = new Error('Connection string leaked here.');
  failure.code = 'ECONNREFUSED';
  failure.field = 'secret';
  failure.reason = 'secret';

  const sent = handle(failure);

  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, {
    error: 'Error',
    message: 'Unexpected server error.',
    code: 'internal_error',
  });
});

test('a server error raised on purpose still answers the generic code', () => {
  const sent = handle(
    new ApplicationError(ERROR_CODES.TOO_LONG, 'Detail.', { statusCode: 502, field: 'x' }),
  );

  assert.equal(sent.status, 502);
  assert.equal(sent.body.code, 'internal_error');
  assert.equal('field' in sent.body, false);
});

// Express raises its own client errors, such as a body that is not JSON, and
// they carry a status but nothing a client can decide on.
test('a client error without a registered code answers invalid_request', () => {
  const malformedBody = new SyntaxError('Unexpected token');
  malformedBody.statusCode = 400;
  malformedBody.type = 'entity.parse.failed';

  const foreignCode = new Error('Library failure.');
  foreignCode.statusCode = 400;
  foreignCode.code = 'ERR_SOMETHING';

  assert.equal(handle(malformedBody).body.code, 'invalid_request');
  assert.equal(handle(foreignCode).body.code, 'invalid_request');
});

test('an error after the response started is handed on, not answered twice', () => {
  const response = responseSpy();
  response.headersSent = true;
  let forwarded = null;

  errorHandler(new Error('late'), {}, response, (error) => {
    forwarded = error;
  });

  assert.equal(forwarded.message, 'late');
  assert.equal(response.sent.status, null);
});
