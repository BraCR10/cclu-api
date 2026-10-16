const {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionLifetime,
} = require('../config/sessionCookie');
const { describeAttempt } = require('../middlewares/rateLimits');
const adminAuthService = require('../services/adminAuthService');
const memberAuthService = require('../services/memberAuthService');
const accountService = require('../services/accountService');

const tokenService = require('../services/tokenService');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

function invalidCredentials() {
  return new ApplicationError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials.', {
    statusCode: 401,
    name: 'Unauthorized',
  });
}

// An attempt under the limits is invisible otherwise, and a run of them is the
// only warning of an attack in progress.
function recordFailedSignIn(request) {
  console.warn('Failed sign in', describeAttempt(request));
}

// "Mantener la sesión iniciada" means one thing: the session should outlive the
// browser. Anything other than a yes is a no.
function readRememberSession(body) {
  return body !== null && typeof body === 'object' && body.rememberSession === true;
}

// The token never reaches the response body. Putting it there would hand it to
// any script on the page, which is the reach the cookie denies. Both clocks come
// from one decision, so the cookie cannot outlive the token inside it.
function establishSession(request, response, identity) {
  const { expiresIn, maxAgeSeconds } = sessionLifetime(readRememberSession(request.body));

  response.cookie(
    SESSION_COOKIE_NAME,
    tokenService.issueToken(identity, process.env.JWT_SECRET, expiresIn),
    sessionCookieOptions(maxAgeSeconds),
  );
  response.status(204).end();
}

// The state is only ever explained to somebody whose password was already
// correct, which is what keeps this from telling strangers who is affiliated
// with the chamber or who holds a panel account.
function refusedForState(outcome) {
  return new ApplicationError(outcome, 'The account does not allow signing in yet.', {
    statusCode: 403,
    name: 'Forbidden',
    reason: outcome,
  });
}

async function signInAdmin(
  request,
  response,
  next,
  authenticateAdmin = adminAuthService.authenticateAdmin,
) {
  const result = await authenticateAdmin(request.body);

  if (result.outcome === adminAuthService.OUTCOMES.INVALID_CREDENTIALS) {
    recordFailedSignIn(request);
    throw invalidCredentials();
  }

  if (result.outcome !== adminAuthService.OUTCOMES.AUTHENTICATED) {
    throw refusedForState(result.outcome);
  }

  establishSession(request, response, result.identity);
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

  establishSession(request, response, result.identity);
}

async function getCurrentIdentity(
  request,
  response,
  next,
  describeCurrentAccount = accountService.describeCurrentAccount,
) {
  const account = await describeCurrentAccount(request.identity);

  // The gate already proved the account is usable, so a record missing here
  // means it disappeared between the two, and the session is worth nothing.
  if (account === null) {
    throw invalidCredentials();
  }

  response.json(account);
}

async function signOut(request, response) {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  response.status(204).end();
}

module.exports = { signInAdmin, signInMember, getCurrentIdentity, signOut };
