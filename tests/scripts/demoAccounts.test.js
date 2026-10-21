const test = require('node:test');
const assert = require('node:assert/strict');
const { DEMO_EMAIL, demoEmail } = require('../../scripts/demoAccounts');

test('a demo account is recognised by its address', () => {
  assert.ok(DEMO_EMAIL.test(demoEmail('cafe-loma-verde')));
});

test('no real address is ever taken for a demo account, so removing them spares it', () => {
  for (const address of [
    'info@camaralaunion.com',
    'cafe@demo.camaralaunion.invalid.example.com',
    'cafe@notdemo.camaralaunion.invalid',
    'demo.camaralaunion.invalid@gmail.com',
  ]) {
    assert.equal(DEMO_EMAIL.test(address), false, address);
  }
});
