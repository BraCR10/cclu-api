const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_PER_ADDRESS = 10;

// Set where a person will never reach it and an attacker gains nothing: the
// hash costs a quarter of a second, so a hundred guesses in fifteen minutes is
// already hopeless. It cannot be set low, and docs/architecture.md says why.
const ATTEMPTS_PER_ACCOUNT = 100;

// The longest address any standard allows. Anything beyond it is not a mailbox,
// and an unbounded one becomes an unbounded key and an unbounded log line.
const MAX_EMAIL_LENGTH = 254;

function emailFrom(request) {
  const email = request.body?.email;

  if (typeof email !== 'string') {
    return null;
  }

  const trimmed = email.trim();

  return trimmed === '' || trimmed.length > MAX_EMAIL_LENGTH ? null : trimmed.toLowerCase();
}

function addressOf(request) {
  return request.ip ?? 'unknown-address';
}

// Passed as a field rather than built into the sentence. Interpolated, a
// newline inside the address writes a second line that reads like ours.
function describeAttempt(request) {
  return { path: request.originalUrl, address: addressOf(request), account: emailFrom(request) };
}

function tooManyAttempts(request, response) {
  // Once the counter is over the limit every further request lands here, and
  // logging each one would let an attacker write the log as fast as they like.
  if (request.rateLimit?.used === request.rateLimit?.limit + 1) {
    console.warn('Rate limit reached', describeAttempt(request));
  }

  response.status(429).json({
    error: 'TooManyRequests',
    message: 'Too many attempts. Wait a few minutes and try again.',
  });
}

// Skipped rather than counted under a shared key, which malformed requests
// would otherwise exhaust for everyone.
function skipsAccountLimit(request) {
  return emailFrom(request) === null;
}

function accountKeyFor(request) {
  return emailFrom(request) ?? 'no-account';
}

// Only failures count. A working sign in is not evidence of an attack, and
// counting it would lock a busy administrator out of their own panel.
const limitByAddress = rateLimit({
  windowMs: WINDOW_MS,
  limit: ATTEMPTS_PER_ADDRESS,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyAttempts,
});

const limitByAccount = rateLimit({
  windowMs: WINDOW_MS,
  limit: ATTEMPTS_PER_ACCOUNT,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  skip: skipsAccountLimit,
  keyGenerator: accountKeyFor,
  handler: tooManyAttempts,
});

module.exports = {
  limitByAddress,
  limitByAccount,
  emailFrom,
  addressOf,
  describeAttempt,
  skipsAccountLimit,
  accountKeyFor,
};

// Registration counts every request, not only the failures. A registration that
// succeeds is still a row created and a hash computed by a stranger.
const REGISTRATIONS_PER_ADDRESS = 5;

const limitRegistrations = rateLimit({
  windowMs: WINDOW_MS,
  limit: REGISTRATIONS_PER_ADDRESS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyAttempts,
});

module.exports.limitRegistrations = limitRegistrations;
