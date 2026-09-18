const SESSION_COOKIE_NAME = 'cclu_session';

// No maxAge on purpose. The token's own expiry ends the session, and a cookie
// with a second clock would eventually disagree with it. Without one the cookie
// also dies when the browser closes, which only ever shortens a session.
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  };
}

module.exports = { SESSION_COOKIE_NAME, sessionCookieOptions };
