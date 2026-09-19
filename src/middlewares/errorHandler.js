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
    // Carried so a screen can say the right thing in its own language without
    // matching on the message text.
    ...(isServerError || error.reason === undefined ? {} : { reason: error.reason }),
  });
}

module.exports = errorHandler;
