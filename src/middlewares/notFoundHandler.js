function notFoundHandler(request, response) {
  response.status(404).json({
    error: 'Not Found',
    message: `Route ${request.method} ${request.originalUrl} does not exist.`,
  });
}

module.exports = notFoundHandler;
