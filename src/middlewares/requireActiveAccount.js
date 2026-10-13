const accountService = require('../services/accountService');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

function unauthorized() {
  return new ApplicationError(ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.', {
    statusCode: 401,
    name: 'Unauthorized',
  });
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
