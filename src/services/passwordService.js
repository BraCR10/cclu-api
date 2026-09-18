const bcrypt = require('bcrypt');

// bcrypt ignores everything past the 72nd byte of a password. The registration
// and password change forms cap length before reaching this service, so a
// password is never silently shortened here.
const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || storedHash === '') {
    return false;
  }

  return bcrypt.compare(password, storedHash);
}

module.exports = { hashPassword, verifyPassword };
