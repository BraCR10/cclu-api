// Upsert keyed on the unique field, so running the seed twice updates the same
// documents instead of creating a second set.
function upsertOperations(entries, keyField) {
  return entries.map((entry) => ({
    updateOne: {
      filter: { [keyField]: entry[keyField] },
      update: { $set: entry },
      upsert: true,
    },
  }));
}

// The fee is the chamber's to change from the panel. It is written only when
// the plan is created, so seeding again never undoes a fee an administrator
// set.
function planUpsertOperations(plans) {
  return plans.map(({ monthlyFee, ...plan }) => ({
    updateOne: {
      filter: { key: plan.key },
      update: { $set: plan, $setOnInsert: { monthlyFee } },
      upsert: true,
    },
  }));
}

module.exports = { upsertOperations, planUpsertOperations };
