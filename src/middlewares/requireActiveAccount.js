const accountService = require('../services/accountService');

function unauthorized() {
  const error = new Error('Authentication required.');
  error.name = 'Unauthorized';
  error.statusCode = 401;

  return error;
}

// A token is a photograph taken at sign in, and nothing rechecks it for the
// rest of its life. Without this, suspending an account would leave the open
// session working until the token happened to expire.
async function requireActiveAccount(
  request,
  response,
  next,
  isIdentityUsable = accountService.isIdentityUsable,
) {
  const usable = await isIdentityUsable(request.identity);

  if (!usable) {
    // 401 rather than 403: the credentials were good, the session is not.
    // A client reading 401 sends the person back to sign in, which is the
    // only thing they can usefully do.
    throw unauthorized();
  }

  next();
}

module.exports = { requireActiveAccount };
