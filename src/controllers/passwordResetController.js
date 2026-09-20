const passwordResetService = require('../services/passwordResetService');

async function requestFromSession(
  request,
  response,
  next,
  requestResetFromSession = passwordResetService.requestResetFromSession,
) {
  response.json(await requestResetFromSession(request.identity, request.body));
}

async function requestForgotten(
  request,
  response,
  next,
  requestForgottenPassword = passwordResetService.requestForgottenPassword,
) {
  response.json(await requestForgottenPassword(request.body));
}

async function checkLink(
  request,
  response,
  next,
  checkResetLink = passwordResetService.checkResetLink,
) {
  response.json(await checkResetLink(request.params.token));
}

async function completeReset(
  request,
  response,
  next,
  completePasswordReset = passwordResetService.completePasswordReset,
) {
  response.json(await completePasswordReset(request.body));
}

module.exports = { requestFromSession, requestForgotten, checkLink, completeReset };
