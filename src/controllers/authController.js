const { SESSION_COOKIE_NAME, sessionCookieOptions } = require('../config/sessionCookie');
const adminAuthService = require('../services/adminAuthService');
const tokenService = require('../services/tokenService');

function invalidCredentials() {
  const error = new Error('Invalid credentials.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

async function signInAdmin(request, response) {
  const identity = await adminAuthService.authenticateAdmin(request.body);

  if (identity === null) {
    throw invalidCredentials();
  }

  // The token never reaches the response body. Putting it there would hand it
  // to any script on the page, which is the exact reach the cookie denies.
  response.cookie(SESSION_COOKIE_NAME, tokenService.issueToken(identity), sessionCookieOptions());
  response.status(204).end();
}

async function getCurrentIdentity(request, response) {
  response.json(request.identity);
}

async function signOut(request, response) {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  response.status(204).end();
}

module.exports = { signInAdmin, getCurrentIdentity, signOut };
