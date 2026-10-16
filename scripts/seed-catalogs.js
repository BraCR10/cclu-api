require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Canton } = require('../src/models/Canton');
const { Activity } = require('../src/models/Activity');
const cantons = require('./data/cantons.json');
const activities = require('./data/activities.json');

// The lists live in JSON beside this script, so adding a cantón or an activity
// is an edit to data rather than to the application. The activities are a
// starting set: the official one is the municipality's patent roll, which the
// chamber keeps from the panel.
const CATALOGS = [
  { label: 'cantons', model: Canton, entries: cantons },
  { label: 'activities', model: Activity, entries: activities },
];

// Upsert keyed on the name, which is the unique index. Running the seed twice
// updates the same documents instead of creating a second set.
function upsertOperations(entries) {
  return entries.map((entry) => ({
    updateOne: {
      filter: { name: entry.name },
      update: { $set: entry },
      upsert: true,
    },
  }));
}

async function seedCatalogs() {
  await connectDatabase();

  for (const { label, model, entries } of CATALOGS) {
    const result = await model.bulkWrite(upsertOperations(entries));

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
