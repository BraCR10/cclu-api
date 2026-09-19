const test = require('node:test');
const assert = require('node:assert/strict');
const { emailFrom, addressOf } = require('../../src/middlewares/limitLoginAttempts');

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
