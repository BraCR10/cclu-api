const jwt = require('jsonwebtoken');

function issueToken(
  identity,
  secret = process.env.JWT_SECRET,
  expiresIn = process.env.JWT_EXPIRES_IN,
) {
  return jwt.sign({ role: identity.role }, secret, {
    subject: String(identity.id),
    expiresIn,
  });
}

function verifyToken(token, secret = process.env.JWT_SECRET) {
  const payload = jwt.verify(token, secret);

  return { id: payload.sub, role: payload.role };
}

module.exports = { issueToken, verifyToken };
