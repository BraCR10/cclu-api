const { ERROR_CODES } = require('../config/errorCodes');

function notFoundHandler(request, response) {
  response.status(404).json({
    error: 'NotFound',
    message: `Route ${request.method} ${request.originalUrl} does not exist.`,
    code: ERROR_CODES.ROUTE_NOT_FOUND,
  });
}

module.exports = notFoundHandler;
