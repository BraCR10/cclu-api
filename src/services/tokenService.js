const jwt = require('jsonwebtoken');

// Naming the algorithm on both sides is what closes algorithm confusion: a
// token whose header asks for none, or for an asymmetric algorithm the secret
// would be read as a public key, is rejected before its payload is trusted.
const ALGORITHM = 'HS256';

function issueToken(
  identity,
  secret = process.env.JWT_SECRET,
  expiresIn = process.env.JWT_EXPIRES_IN,
) {
  return jwt.sign({ role: identity.role }, secret, {
    algorithm: ALGORITHM,
    subject: String(identity.id),
    expiresIn,
  });
}

function verifyToken(token, secret = process.env.JWT_SECRET) {
  const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });

  return { id: payload.sub, role: payload.role };
}

module.exports = { issueToken, verifyToken };
