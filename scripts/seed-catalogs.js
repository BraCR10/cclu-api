require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Canton } = require('../src/models/Canton');
const { Activity } = require('../src/models/Activity');
const { Plan } = require('../src/models/Plan');
const { upsertOperations, planUpsertOperations } = require('./catalogOperations');
const cantons = require('./data/cantons.json');
const activities = require('./data/activities.json');
const plans = require('./data/plans.json');

// The lists live in JSON beside this script, so adding a cantón or an activity
// is an edit to data rather than to the application. The activities are a
// starting set: the official one is the municipality's patent roll, which the
// chamber keeps from the panel.
const CATALOGS = [
  { label: 'cantons', model: Canton, entries: cantons, operations: upsertByName },
  { label: 'activities', model: Activity, entries: activities, operations: upsertByName },
  { label: 'plans', model: Plan, entries: plans, operations: planUpsertOperations },
];

function upsertByName(entries) {
  return upsertOperations(entries, 'name');
}

async function seedCatalogs() {
  await connectDatabase();

  for (const { label, model, entries, operations } of CATALOGS) {
    const result = await model.bulkWrite(operations(entries));

    console.log(
      `${label}: ${result.upsertedCount} created, ${result.modifiedCount} updated, ${entries.length} total`,
    );
  }
}

seedCatalogs()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
