const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function forbidden() {
  return new ApplicationError(ERROR_CODES.ORIGIN_NOT_ALLOWED, 'Request origin is not allowed.', {
    statusCode: 403,
    name: 'Forbidden',
  });
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
