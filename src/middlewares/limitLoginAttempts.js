const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_PER_ADDRESS = 10;

// Deliberately higher than the address limit. Limiting by account is what stops
// one attacker spreading guesses across many addresses, but it is also a way to
// lock a real administrator out by guessing at their email on purpose. Keeping
// it above the address limit means an attacker trips their own limit first.
const ATTEMPTS_PER_ACCOUNT = 30;

function emailFrom(request) {
  const email = request.body?.email;

  return typeof email === 'string' ? email.trim().toLowerCase() : 'no-email';
}

function tooManyAttempts(request, response) {
  console.warn(`Rate limit reached for ${request.method} ${request.originalUrl}`);

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
  keyGenerator: emailFrom,
  handler: tooManyAttempts,
});

module.exports = { limitByAddress, limitByAccount, emailFrom };
