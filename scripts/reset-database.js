require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Canton } = require('../src/models/Canton');
const { Activity } = require('../src/models/Activity');
const { Plan } = require('../src/models/Plan');
const { Settings, NOTICE_DAYS } = require('../src/models/Settings');
const cantons = require('./data/cantons.json');
const activities = require('./data/activities.json');
const plans = require('./data/plans.json');

const MODELS_DIRECTORY = path.join(__dirname, '../src/models');

const CATALOGS = [
  { label: 'cantons', model: Canton, entries: cantons },
  { label: 'activities', model: Activity, entries: activities },
  { label: 'plans', model: Plan, entries: plans },
];

// Wiping a database cannot be undone, so the operator has to name the one they
// mean. The name is read from the live connection, not from the environment, so
// a wrong .env shows up in the prompt before anything is deleted.
function refuseReset({ databaseName, confirmation }) {
  if (typeof databaseName !== 'string' || databaseName === '') {
    return 'The connection string names no database, so there is nothing safe to reset.';
  }

  if (confirmation !== databaseName) {
    return `Nothing was deleted: the confirmation must be the database name, "${databaseName}".`;
  }

  return null;
}

function readConfirmation(argv) {
  const index = argv.indexOf('--confirm');

  return index === -1 ? undefined : argv[index + 1];
}

async function askConfirmation(databaseName) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    return (await prompt.question(`Type "${databaseName}" to delete everything in it: `)).trim();
  } finally {
    prompt.close();
  }
}

// Every model is loaded so its indexes are rebuilt before anything is written:
// the unique ones are what keep the seeds and the first accounts honest.
async function rebuildIndexes() {
  for (const file of fs.readdirSync(MODELS_DIRECTORY)) {
    if (file.endsWith('.js')) {
      require(path.join(MODELS_DIRECTORY, file));
    }
  }

  const models = Object.values(mongoose.models);

  await Promise.all(models.map((model) => model.syncIndexes()));
  console.log(`indexes: rebuilt for ${models.length} collections`);
}

async function seedCatalogs() {
  for (const { label, model, entries } of CATALOGS) {
    await model.insertMany(entries);
    console.log(`${label}: ${entries.length} created`);
  }

  await Settings.create({ expiryNoticeDays: NOTICE_DAYS.DEFAULT });
  console.log(`settings: ${NOTICE_DAYS.DEFAULT} days expiry notice`);
}

async function resetDatabase() {
  await connectDatabase();

  const { host, name: databaseName } = mongoose.connection;

  console.log(`Database: ${databaseName} on ${host}`);

  const confirmation = readConfirmation(process.argv) ?? (await askConfirmation(databaseName));
  const refusal = refuseReset({ databaseName, confirmation });

  if (refusal !== null) {
    throw new Error(refusal);
  }

  await mongoose.connection.dropDatabase();
  console.log(`${databaseName}: dropped`);

  await rebuildIndexes();
  await seedCatalogs();
  console.log(
    'Done. Uploaded files in storage are untouched. Invite the first administrator next.',
  );
}

// Run from the command line only, so the tests can load the guard without
// connecting to anything.
if (require.main === module) {
  resetDatabase()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error(error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { refuseReset, readConfirmation };
