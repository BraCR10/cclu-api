const { Admin } = require('../models/Admin');
const { readText, readPassword, ValidationError, refuse } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const passwordService = require('./passwordService');

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
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  return present(admin);
}

// The name is the only thing here an administrator decides. Named explicitly
// rather than taken from the body, so a request carrying an address, a role or
// a password hash is simply never read.
async function updateOwnProfile(identity, body, save = defaultSave) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const name = readText(body, 'name', { required: true });
  const admin = await save(identity.id, { name });

  if (admin === null || admin === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  return present(admin);
}

function defaultSave(id, fields) {
  return Admin.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' }).lean();
}

const defaultPasswordStore = {
  findById: (id) => Admin.findById(id).lean(),
  save: (id, fields) => Admin.updateOne({ _id: id }, { $set: fields }),
};

// An administrator choosing a password for themselves. The current one is asked
// for and checked, so a session left open on a shared machine cannot quietly
// take the account; the new one is written through the same rules the invitation
// and the reset link use.
async function changeOwnPassword(
  identity,
  body,
  now = new Date(),
  store = defaultPasswordStore,
  passwords = passwordService,
) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const currentPassword = readText(body, 'currentPassword', { required: true });
  const newPassword = readPassword(body, 'newPassword');
  const admin = await store.findById(identity.id);

  if (admin === null || admin === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  if (!(await passwords.verifyPassword(currentPassword, admin.passwordHash))) {
    refuse(
      ERROR_CODES.INVALID_CURRENT_PASSWORD,
      'currentPassword',
      'The current password is not the one on this account.',
    );
  }

  await store.save(identity.id, {
    passwordHash: await passwords.hashPassword(newPassword),
    passwordChangedAt: now,
  });

  return present(admin);
}

module.exports = { readOwnProfile, updateOwnProfile, changeOwnPassword, present };
