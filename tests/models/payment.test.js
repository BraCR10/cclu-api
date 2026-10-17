const test = require('node:test');
const assert = require('node:assert/strict');
const { Payment } = require('../../src/models/Payment');

const REFUSED = /decided once/;
const ID = '65f0c3a1b2c3d4e5f6a7b8c9';

// The hooks run before Mongoose reaches the database, so no connection is
// needed to prove a rewrite is refused.
test('a payment cannot be removed or replaced', async () => {
  await assert.rejects(Payment.deleteOne({ _id: ID }), REFUSED);
  await assert.rejects(Payment.deleteMany({}), REFUSED);
  await assert.rejects(Payment.findOneAndDelete({ _id: ID }), REFUSED);
  await assert.rejects(Payment.replaceOne({ _id: ID }, {}), REFUSED);
  await assert.rejects(Payment.updateMany({}, { $set: { status: 'approved' } }), REFUSED);
});

test('only the decision of a pending payment may be written', async () => {
  // No filter on the pending state.
  await assert.rejects(Payment.updateOne({ _id: ID }, { $set: { status: 'approved' } }), REFUSED);
  // Back to pending.
  await assert.rejects(
    Payment.updateOne(
      { _id: ID, status: 'pending_review' },
      { $set: { status: 'pending_review' } },
    ),
    REFUSED,
  );
  // A field that is not part of a decision.
  await assert.rejects(
    Payment.updateOne(
      { _id: ID, status: 'pending_review' },
      { $set: { status: 'approved', amount: 1 } },
    ),
    REFUSED,
  );
  // Another operator.
  await assert.rejects(
    Payment.updateOne(
      { _id: ID, status: 'pending_review' },
      { $set: { status: 'approved' }, $inc: { amount: 1 } },
    ),
    REFUSED,
  );
  // Changing a decided payment.
  await assert.rejects(
    Payment.findOneAndUpdate({ _id: ID, status: 'approved' }, { $set: { status: 'rejected' } }),
    REFUSED,
  );
});

test('a bulk write may only insert payments', async () => {
  await assert.rejects(Payment.bulkWrite([{ deleteOne: { filter: { _id: ID } } }]), REFUSED);
});

test('a payment already stored cannot be saved again', async () => {
  const payment = new Payment();
  payment.isNew = false;

  await assert.rejects(payment.save({ validateBeforeSave: false }), REFUSED);
});
