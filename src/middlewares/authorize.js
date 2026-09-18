function unauthorized() {
  const error = new Error('Authentication required.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

function forbidden() {
  const error = new Error('This role cannot access the resource.');
  error.name = 'Forbidden';
  error.statusCode = 403;

  return error;
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
