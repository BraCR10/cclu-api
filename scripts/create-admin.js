require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Admin } = require('../src/models/Admin');
const { ADMIN_ACCOUNT_STATUSES, effectiveAdminState } = require('../src/config/accountStatus');
const { inviteAdmin, resendInvitation } = require('../src/services/adminDirectoryService');

// The panel has no way to sign up, so the first administrator is invited from
// here. The person chooses their own password from the link in the mail, the
// same way an administrator invited from the panel does.

const USAGE = 'Usage: npm run create-admin -- <email> "<name>"';

function readArguments() {
  const [email, name] = process.argv.slice(2);

  if (typeof email !== 'string' || typeof name !== 'string' || name.trim() === '') {
    throw new Error(USAGE);
  }

  return { email: email.trim().toLowerCase(), name: name.trim() };
}

// Without the site's address the mail would carry no link, and the account
// would wait for an invitation nobody can accept.
function requireWebOrigin() {
  if (typeof process.env.WEB_ORIGIN !== 'string' || process.env.WEB_ORIGIN.trim() === '') {
    throw new Error('Set WEB_ORIGIN so the invitation can link to the site.');
  }
}

function isAwaitingInvitation(admin) {
  const state = effectiveAdminState(admin);

  return (
    state === ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING ||
    state === ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED
  );
}

// Running it again for an invitation that never arrived sends a new link,
// because no administrator exists yet to resend it from the panel.
async function createAdmin() {
  const { email, name } = readArguments();

  requireWebOrigin();
  await connectDatabase();

  const existing = await Admin.findOne({ email })
    .select('accountStatus invitationExpiresAt')
    .lean();

  if (existing !== null && isAwaitingInvitation(existing)) {
    await resendInvitation(undefined, existing._id);
    console.log(`Invitation sent again to ${email}`);
    return;
  }

  await inviteAdmin(undefined, { email, name });
  console.log(`Invitation sent to ${email}`);
}

createAdmin()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
