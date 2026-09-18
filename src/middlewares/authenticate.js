const tokenService = require('../services/tokenService');
const { SESSION_COOKIE_NAME } = require('../config/sessionCookie');

function unauthorized() {
  const error = new Error('Authentication required.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

function authenticate(request, response, next) {
  const token = request.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
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

module.exports = { authenticate };
