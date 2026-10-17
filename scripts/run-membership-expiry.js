require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { runMembershipExpiry } = require('../src/jobs/membershipExpiryJob');

// The same run the API does every hour, for when it must happen now.
async function runOnce() {
  await connectDatabase();

  const { lapsed, reminded } = await runMembershipExpiry();

  console.log(`memberships: ${lapsed} moved to Gratuita, ${reminded} reminded`);
}

runOnce()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
