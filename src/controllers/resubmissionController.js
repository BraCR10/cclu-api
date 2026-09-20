const resubmissionService = require('../services/resubmissionService');

// Public on purpose. The token in the link is the proof, and asking for a
// session would lock out exactly the person this is for: someone whose
// registration was refused and who therefore cannot sign in.
async function getRejectedRegistration(
  request,
  response,
  next,
  readRejectedRegistration = resubmissionService.readRejectedRegistration,
) {
  response.json(await readRejectedRegistration(request.params.token));
}

async function resubmit(
  request,
  response,
  next,
  resubmitRegistration = resubmissionService.resubmitRegistration,
) {
  response.json(await resubmitRegistration(request.params.token, request.body));
}

module.exports = { getRejectedRegistration, resubmit };
