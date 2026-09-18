const tokenService = require('../services/tokenService');

const BEARER_SCHEME = 'Bearer';

function readBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token, ...extra] = authorizationHeader.split(' ');

  if (scheme !== BEARER_SCHEME || !token || extra.length > 0) {
    return null;
  }

  return token;
}

function unauthorized() {
  const error = new Error('Authentication required.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

function authenticate(request, response, next) {
  const token = readBearerToken(request.headers.authorization);

  if (token === null) {
    throw unauthorized();
  }

  try {
    request.identity = tokenService.verifyToken(token);
  } catch {
    // A rejected token is a client error. Letting the library error through
    // would reach the handler without a status and be reported as a 500.
    throw unauthorized();
  }

  next();
}

module.exports = { authenticate, readBearerToken };
