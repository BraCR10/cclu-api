require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Canton } = require('../src/models/Canton');
const { Sector } = require('../src/models/Sector');
const cantons = require('./data/cantons.json');
const sectors = require('./data/sectors.json');

// The lists live in JSON beside this script, so adding a cantón or a sector is
// an edit to data rather than to the application.
const CATALOGS = [
  { label: 'cantons', model: Canton, entries: cantons },
  { label: 'sectors', model: Sector, entries: sectors },
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
