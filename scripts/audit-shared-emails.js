require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Member } = require('../src/models/Member');
const { Admin } = require('../src/models/Admin');

// The rule that one address opens one account is enforced on the way in, and a
// check on the way in says nothing about what is already stored. This reports
// what is, so the rule can be trusted by the code that depends on it.

async function audit() {
  await connectDatabase();

  const [members, admins] = await Promise.all([
    Member.find({}).select('email').lean(),
    Admin.find({}).select('email').lean(),
  ]);

  const adminAddresses = new Set(admins.map(({ email }) => email));
  const shared = members.filter(({ email }) => adminAddresses.has(email));

  console.log(`Members: ${members.length}`);
  console.log(`Administrators: ${admins.length}`);
  console.log(`Addresses held by both: ${shared.length}`);

  for (const { email } of shared) {
    console.log(`  ${email}`);
  }

  return shared.length;
}

audit()
  .then(async (shared) => {
    await mongoose.disconnect();
    // A non zero exit so this can gate anything that assumes the rule holds.
    process.exit(shared === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
