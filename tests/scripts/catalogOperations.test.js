const test = require('node:test');
const assert = require('node:assert/strict');
const { planUpsertOperations } = require('../../scripts/catalogOperations');
const { PLAN_KEYS } = require('../../src/models/Plan');
const plans = require('../../scripts/data/plans.json');

// Seeding again must never undo a fee an administrator set from the panel.
test('the seed writes a plan fee only when it creates the plan', () => {
  for (const { updateOne } of planUpsertOperations(plans)) {
    assert.equal('monthlyFee' in updateOne.update.$set, false);
    assert.equal(typeof updateOne.update.$setOnInsert.monthlyFee, 'number');
    assert.equal(updateOne.upsert, true);
  }
});

test('the seed carries every plan once, with Gratuita free', () => {
  const keys = plans.map((plan) => plan.key);

  assert.deepEqual([...keys].sort(), Object.values(PLAN_KEYS).sort());
  assert.equal(plans.find((plan) => plan.key === PLAN_KEYS.FREE).monthlyFee, 0);
});
