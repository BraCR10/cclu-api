require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Member, APPLICATION_STATUSES } = require('../src/models/Member');
const { grantFreeMembership } = require('../src/services/membershipService');

// Gives Gratuita to every member approved before memberships existed. Safe to
// run again: a member who already has a membership keeps it untouched.
async function grantMissing() {
  await connectDatabase();

  const approved = await Member.find({ applicationStatus: APPLICATION_STATUSES.APPROVED })
    .select('_id reviewedAt')
    .lean();

  for (const member of approved) {
    await grantFreeMembership(member._id, member.reviewedAt ?? new Date());
  }

  console.log(`memberships: checked ${approved.length} approved members`);
}

grantMissing()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
