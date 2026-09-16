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

  response.status(statusCode).json({
    error: error.name ?? 'InternalServerError',
    message: isServerError ? 'Unexpected server error.' : error.message,
  });
}

module.exports = errorHandler;
