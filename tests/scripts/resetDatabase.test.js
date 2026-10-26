const test = require('node:test');
const assert = require('node:assert/strict');
const { refuseReset, readConfirmation } = require('../../scripts/reset-database');

test('a reset goes ahead only when the operator names the database', () => {
  assert.equal(refuseReset({ databaseName: 'cclu', confirmation: 'cclu' }), null);
  assert.match(refuseReset({ databaseName: 'cclu', confirmation: 'yes' }), /Nothing was deleted/);
  assert.match(
    refuseReset({ databaseName: 'cclu', confirmation: undefined }),
    /Nothing was deleted/,
  );
});

test('a connection string without a database name is never reset', () => {
  assert.match(refuseReset({ databaseName: '', confirmation: '' }), /names no database/);
});

test('the confirmation is read from the flag that follows --confirm', () => {
  assert.equal(readConfirmation(['node', 'reset', '--confirm', 'cclu']), 'cclu');
  assert.equal(readConfirmation(['node', 'reset']), undefined);
});
