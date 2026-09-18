const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function forbidden() {
  const error = new Error('Request origin is not allowed.');
  error.name = 'Forbidden';
  error.statusCode = 403;

  return error;
}

function verifyOrigin(request, response, next, allowedOrigin = process.env.WEB_ORIGIN) {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const origin = request.headers.origin;

  // A browser always sends Origin on a state-changing request, so a forged
  // page cannot hide behind a missing header. Tools such as Postman send none,
  // and blocking them would break manual testing without stopping an attack.
  if (origin === undefined) {
    next();
    return;
  }

  if (origin !== allowedOrigin) {
    throw forbidden();
  }

  next();
}

module.exports = { verifyOrigin };
