const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_PER_ADDRESS = 10;

// Set where a person will never reach it and an attacker gains nothing. Hashing
// costs a quarter of a second, so a hundred guesses in fifteen minutes is
// already hopeless against any real password.
//
// It cannot be set low. Blocking by account alone means anyone who knows an
// address can lock its owner out by guessing at it from enough places, and no
// value avoids that: a limit tight enough to stop distributed guessing is tight
// enough to be used as a weapon. The hash is the defence; this is the backstop.
const ATTEMPTS_PER_ACCOUNT = 100;

function emailFrom(request) {
  const email = request.body?.email;

  return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
}

function addressOf(request) {
  return request.ip ?? 'unknown-address';
}

function tooManyAttempts(request, response) {
  console.warn(
    `Rate limit reached on ${request.originalUrl} from ${addressOf(request)} for ${emailFrom(request) ?? 'no account'}`,
  );

  response.status(429).json({
    error: 'TooManyRequests',
    message: 'Too many attempts. Wait a few minutes and try again.',
  });
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
  // A body with no usable address is skipped rather than counted under a shared
  // key, which would let malformed requests exhaust one bucket for everyone.
  skip: (request) => emailFrom(request) === null,
  keyGenerator: (request) => emailFrom(request) ?? 'no-account',
  handler: tooManyAttempts,
});

module.exports = { limitByAddress, limitByAccount, emailFrom, addressOf };
