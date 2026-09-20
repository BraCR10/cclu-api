const passwordChangeService = require('../services/passwordChangeService');

async function requestChange(
  request,
  response,
  next,
  requestPasswordChange = passwordChangeService.requestPasswordChange,
) {
  response.json(await requestPasswordChange(request.identity, request.body));
}

async function confirmChange(
  request,
  response,
  next,
  confirmPasswordChange = passwordChangeService.confirmPasswordChange,
) {
  response.json(await confirmPasswordChange(request.identity, request.body));
}

module.exports = { requestChange, confirmChange };
