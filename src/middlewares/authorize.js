const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

function unauthorized() {
  return new ApplicationError(ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.', {
    statusCode: 401,
    name: 'Unauthorized',
  });
}

function forbidden() {
  return new ApplicationError(
    ERROR_CODES.ROLE_NOT_ALLOWED,
    'This role cannot access the resource.',
    {
      statusCode: 403,
      name: 'Forbidden',
    },
  );
}

function authorize(...allowedRoles) {
  return function authorizeRequest(request, response, next) {
    if (!request.identity) {
      throw unauthorized();
    }

    if (!allowedRoles.includes(request.identity.role)) {
      throw forbidden();
    }

    next();
  };
}

module.exports = { authorize };
