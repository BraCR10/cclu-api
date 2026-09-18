const { SESSION_COOKIE_NAME, sessionCookieOptions } = require('../config/sessionCookie');

async function getCurrentIdentity(request, response) {
  response.json(request.identity);
}

async function signOut(request, response) {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  response.status(204).end();
}

module.exports = { getCurrentIdentity, signOut };
