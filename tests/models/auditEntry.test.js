const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditEntry } = require('../../src/models/AuditEntry');

const APPEND_ONLY = /append-only/;

// The hooks run before Mongoose reaches the database, so no connection is
// needed to prove a rewrite is refused.
test('an audit entry cannot be updated or deleted through a query', async () => {
  await assert.rejects(AuditEntry.updateOne({}, { $set: { action: 'x' } }), APPEND_ONLY);
  await assert.rejects(AuditEntry.findOneAndUpdate({}, { $set: { action: 'x' } }), APPEND_ONLY);
  await assert.rejects(AuditEntry.replaceOne({}, {}), APPEND_ONLY);
  await assert.rejects(AuditEntry.deleteOne({}), APPEND_ONLY);
  await assert.rejects(AuditEntry.deleteMany({}), APPEND_ONLY);
});

test('an audit entry already stored cannot be saved again', async () => {
  const entry = new AuditEntry();
  entry.isNew = false;

  await assert.rejects(entry.save({ validateBeforeSave: false }), APPEND_ONLY);
});
