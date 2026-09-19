const { SESSION_COOKIE_NAME, sessionCookieOptions } = require('../config/sessionCookie');
const { describeAttempt } = require('../middlewares/rateLimits');
const adminAuthService = require('../services/adminAuthService');
const memberAuthService = require('../services/memberAuthService');
const tokenService = require('../services/tokenService');

function invalidCredentials() {
  const error = new Error('Invalid credentials.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

// An attempt under the limits is invisible otherwise, and a run of them is the
// only warning of an attack in progress.
function recordFailedSignIn(request) {
  console.warn('Failed sign in', describeAttempt(request));
}

async function signInAdmin(
  request,
  response,
  next,
  authenticateAdmin = adminAuthService.authenticateAdmin,
) {
  const identity = await authenticateAdmin(request.body);

  if (identity === null) {
    recordFailedSignIn(request);
    throw invalidCredentials();
  }

  // The token never reaches the response body. Putting it there would hand it
  // to any script on the page, which is the reach the cookie denies.
  response.cookie(SESSION_COOKIE_NAME, tokenService.issueToken(identity), sessionCookieOptions());
  response.status(204).end();
}

// The state of the application is only ever explained to someone whose password
// was already correct, which is what keeps this from telling strangers who is
// affiliated with the chamber.
function refusedForState(outcome) {
  const error = new Error('The registration does not allow signing in yet.');
  error.name = 'Forbidden';
  error.statusCode = 403;
  error.reason = outcome;

  return error;
}

async function signInMember(
  request,
  response,
  next,
  authenticateMember = memberAuthService.authenticateMember,
) {
  const result = await authenticateMember(request.body);

  if (result.outcome === memberAuthService.OUTCOMES.INVALID_CREDENTIALS) {
    recordFailedSignIn(request);
    throw invalidCredentials();
  }

  if (result.outcome !== memberAuthService.OUTCOMES.AUTHENTICATED) {
    throw refusedForState(result.outcome);
  }

  response.cookie(
    SESSION_COOKIE_NAME,
    tokenService.issueToken(result.identity),
    sessionCookieOptions(),
  );
  response.status(204).end();
}

async function getCurrentIdentity(request, response) {
  response.json(request.identity);
}

async function signOut(request, response) {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  response.status(204).end();
}

module.exports = { signInAdmin, signInMember, getCurrentIdentity, signOut };
