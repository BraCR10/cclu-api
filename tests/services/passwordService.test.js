const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../src/services/passwordService');

test('hashPassword never produces the same hash twice for one password', async () => {
  const first = await hashPassword('Contrasena-Seg7ra');
  const second = await hashPassword('Contrasena-Seg7ra');

  assert.notEqual(first, second);
});

test('hashPassword keeps the password out of the stored value', async () => {
  const hash = await hashPassword('Contrasena-Seg7ra');

  assert.ok(!hash.includes('Contrasena-Seg7ra'));
});

test('hashPassword records the cost inside the hash so it can be raised later', async () => {
  const hash = await hashPassword('Contrasena-Seg7ra');

  assert.match(hash, /^\$2[aby]\$12\$/);
});

test('verifyPassword accepts the password that produced the hash', async () => {
  const hash = await hashPassword('Contrasena-Seg7ra');

  assert.equal(await verifyPassword('Contrasena-Seg7ra', hash), true);
});

test('verifyPassword rejects any other password', async () => {
  const hash = await hashPassword('Contrasena-Seg7ra');

  assert.equal(await verifyPassword('Contrasena-Seg7r', hash), false);
  assert.equal(await verifyPassword('contrasena-seg7ra', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('verifyPassword rejects a stored value it cannot read instead of failing', async () => {
  assert.equal(await verifyPassword('Contrasena-Seg7ra', undefined), false);
  assert.equal(await verifyPassword('Contrasena-Seg7ra', ''), false);
  assert.equal(await verifyPassword('Contrasena-Seg7ra', 'not-a-bcrypt-hash'), false);
});
