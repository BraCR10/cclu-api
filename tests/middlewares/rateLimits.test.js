const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emailFrom,
  addressOf,
  describeAttempt,
  skipsAccountLimit,
  accountKeyFor,
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
