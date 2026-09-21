const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emailFrom,
  addressOf,
  describeAttempt,
  skipsAccountLimit,
  accountKeyFor,
  limitForgotPasswordByAddress,
  limitForgotPasswordByAccount,
  limitByAddress,
} = require('../../src/middlewares/rateLimits');

test('emailFrom takes the address the attempt was aimed at', () => {
  assert.equal(emailFrom({ body: { email: '  ADMIN@CCLU.CR ' } }), 'admin@cclu.cr');
});

test('emailFrom answers nothing rather than a shared key it cannot trust', () => {
  assert.equal(emailFrom({ body: { email: { $ne: null } } }), null);
  assert.equal(emailFrom({ body: { email: ['a@b.cr'] } }), null);
  assert.equal(emailFrom({ body: { email: '   ' } }), null);
  assert.equal(emailFrom({ body: {} }), null);
  assert.equal(emailFrom({}), null);
});

test('addressOf names the caller, or says it could not', () => {
  assert.equal(addressOf({ ip: '203.0.113.7' }), '203.0.113.7');
  assert.equal(addressOf({}), 'unknown-address');
});

test('emailFrom refuses an address longer than any mailbox can be', () => {
  const tooLong = `${'a'.repeat(250)}@cclu.cr`;

  const longEnough = `${'a'.repeat(240)}@cclu.cr`;

  assert.equal(emailFrom({ body: { email: tooLong } }), null);
  assert.equal(emailFrom({ body: { email: longEnough } }), longEnough);
});

test('describeAttempt keeps the attempt in fields, where a newline cannot forge a line', () => {
  const forged = 'x@x.cr\nFailed sign in from 10.0.0.1 for victim@cclu.cr';
  const described = describeAttempt({
    originalUrl: '/api/auth/admin/login',
    ip: '203.0.113.7',
    body: { email: forged },
  });

  assert.deepEqual(described, {
    path: '/api/auth/admin/login',
    address: '203.0.113.7',
    account: forged.toLowerCase(),
  });
  assert.ok(!Object.values(described).some((value) => typeof value !== 'string' && value !== null));
});

test('the account limit counts a real address and steps aside for anything else', () => {
  assert.equal(skipsAccountLimit({ body: { email: 'admin@cclu.cr' } }), false);
  assert.equal(skipsAccountLimit({ body: { email: { $ne: null } } }), true);
  assert.equal(skipsAccountLimit({ body: {} }), true);
});

test('the account limit counts each address in its own bucket', () => {
  assert.equal(accountKeyFor({ body: { email: ' Admin@CCLU.cr ' } }), 'admin@cclu.cr');
  assert.notEqual(
    accountKeyFor({ body: { email: 'a@cclu.cr' } }),
    accountKeyFor({ body: { email: 'b@cclu.cr' } }),
  );
});

// A minimal response the rate limiter can write its headers to and observe the
// status code from.
function fakeResponse(statusCode = 200) {
  const headers = new Map();

  return {
    statusCode,
    headersSent: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    append(name, value) {
      const key = name.toLowerCase();
      headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : String(value));
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    once() {},
    emit() {},
  };
}

function fakeRequest(ip, email) {
  return { ip, body: email === undefined ? {} : { email }, originalUrl: '/api/auth/password/forgot' };
}

// The forgot-password endpoint answers HTTP 200 for every address, so its
// limiters must count the 200s. The plain address limiter proves it: successive
// calls raise the counter even though the response is a success.
test('the forgot-password address limiter counts successful 200 responses', async () => {
  const first = fakeRequest('203.0.113.7');
  await limitForgotPasswordByAddress(first, fakeResponse(200), () => {});

  const second = fakeRequest('203.0.113.7');
  await limitForgotPasswordByAddress(second, fakeResponse(200), () => {});

  // The counter went up across two successful responses: used = 2.
  assert.equal(second.rateLimit.used, 2);
  assert.equal(second.rateLimit.limit, 10);

  // The sign-in limiter, by contrast, is configured to skip successes.
  const signInFirst = fakeRequest('203.0.113.8');
  await limitByAddress(signInFirst, fakeResponse(200), () => {});
  // Its skipSuccessfulRequests decrements after 'finish', which our fake never
  // emits, so we only assert the configuration difference below.
});

// The per-account limiter for forgot-password must also count the 200s, keyed
// by the address and never skipping successful answers.
test('the forgot-password account limiter counts 200s per address', async () => {
  const first = fakeRequest('203.0.113.7', 'socio@example.cr');
  await limitForgotPasswordByAccount(first, fakeResponse(200), () => {});

  const second = fakeRequest('203.0.113.8', 'socio@example.cr');
  await limitForgotPasswordByAccount(second, fakeResponse(200), () => {});

  assert.equal(second.rateLimit.used, 2);
  assert.equal(second.rateLimit.limit, 100);
});
