const emailChangeService = require('../services/emailChangeService');

// Asked for from the profile, by whoever is signed in, and it only sends a
// message. Nothing about the account changes until that message is answered.
async function requestEmailChange(
  request,
  response,
  next,
  requestChange = emailChangeService.requestEmailChange,
) {
  response.json(await requestChange(request.identity.id, request.body));
}

// Public on purpose. The link may be opened on another device than the one the
// change was asked from, and the token is the proof that it is the same person
// who owns the address being claimed.
async function getEmailChange(
  request,
  response,
  next,
  readChange = emailChangeService.readEmailChange,
) {
  response.json(await readChange(request.params.token));
}

async function confirmEmailChange(
  request,
  response,
  next,
  confirm = emailChangeService.confirmEmailChange,
) {
  response.json(await confirm(request.params.token));
}

module.exports = { requestEmailChange, getEmailChange, confirmEmailChange };
