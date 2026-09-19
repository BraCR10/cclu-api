const bcrypt = require('bcrypt');

// bcrypt reads no further than the 72nd byte. Callers refuse anything longer,
// so nothing is silently shortened here.
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
