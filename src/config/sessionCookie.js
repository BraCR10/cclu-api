const SESSION_COOKIE_NAME = 'cclu_session';

// A session asked to outlive the browser lasts this long. Both clocks — the one
// inside the token and the one on the cookie — are given the same span, so
// neither can outlive the other.
const REMEMBERED_SESSION_DAYS_VARIABLE = 'REMEMBERED_SESSION_DAYS';
const DEFAULT_REMEMBERED_SESSION_DAYS = 30;

function rememberedSessionDays(environment = process.env) {
  const configured = Number(environment[REMEMBERED_SESSION_DAYS_VARIABLE]);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_REMEMBERED_SESSION_DAYS;
}

// Decided in one place because two clocks are being set. Without the checkbox
// the token's own expiry from the environment ends the session and the cookie
// stays a session cookie; with it, the two are stretched together.
function sessionLifetime(rememberSession, environment = process.env) {
  if (rememberSession !== true) {
    return { expiresIn: environment.JWT_EXPIRES_IN };
  }

  const days = rememberedSessionDays(environment);

  return { expiresIn: `${days}d`, maxAgeSeconds: days * 24 * 60 * 60 };
}

// No maxAge unless a session was asked to outlive the browser. The token's own
// expiry ends the session; a cookie without a clock dies when the browser
// closes, which only ever shortens one.
function sessionCookieOptions(maxAgeSeconds) {
  const options = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  };

  if (Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0) {
    options.maxAge = maxAgeSeconds * 1000;
  }

  return options;
}

module.exports = {
  SESSION_COOKIE_NAME,
  REMEMBERED_SESSION_DAYS_VARIABLE,
  sessionLifetime,
  sessionCookieOptions,
};
