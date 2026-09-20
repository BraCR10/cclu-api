const { Admin } = require('../models/Admin');
const { readText, ValidationError, CODES, refuse } = require('../config/memberRules');

// What an administrator may see of their own account. Built field by field, so
// the password hash cannot travel by being forgotten about.
function present(admin) {
  return {
    id: String(admin._id),
    name: admin.name ?? null,
    email: admin.email,
    accountStatus: admin.accountStatus,
  };
}

async function readOwnProfile(identity, find = (id) => Admin.findById(id).lean()) {
  const admin = await find(identity.id);

  if (admin === null || admin === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  return present(admin);
}

// The name is the only thing here an administrator decides. Named explicitly
// rather than taken from the body, so a request carrying an address, a role or
// a password hash is simply never read.
async function updateOwnProfile(identity, body, save = defaultSave) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const name = readText(body, 'name', { required: true });
  const admin = await save(identity.id, { name });

  if (admin === null || admin === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  return present(admin);
}

function defaultSave(id, fields) {
  return Admin.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' }).lean();
}

module.exports = { readOwnProfile, updateOwnProfile, present };
