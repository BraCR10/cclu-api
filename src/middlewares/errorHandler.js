const { ERROR_CODES, isRegisteredCode } = require('../config/errorCodes');

function serverErrorBody(error) {
  return {
    error: error.name ?? 'InternalServerError',
    message: 'Unexpected server error.',
    code: ERROR_CODES.INTERNAL_ERROR,
  };
}

// Express raises its own client errors, such as a body that is not JSON, and a
// library may set a code of its own. Neither is one a client can decide on.
function clientCodeOf(error) {
  return isRegisteredCode(error.code) ? error.code : ERROR_CODES.INVALID_REQUEST;
}

function clientErrorBody(error) {
  return {
    error: error.name ?? 'BadRequest',
    message: error.message,
    code: clientCodeOf(error),
    ...(error.field === undefined || error.field === null ? {} : { field: error.field }),
    ...(error.reason === undefined ? {} : { reason: error.reason }),
  };
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode ?? 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error(error);
  }

  response.status(statusCode).json(isServerError ? serverErrorBody(error) : clientErrorBody(error));
}

module.exports = errorHandler;
