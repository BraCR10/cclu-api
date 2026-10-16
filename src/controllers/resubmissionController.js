const resubmissionService = require('../services/resubmissionService');

// Public on purpose. The token in the link is the proof, and asking for a
// session would lock out exactly the person this is for: someone whose
// registration was refused or sent back and who therefore cannot sign in.
async function getCorrectionRequest(
  request,
  response,
  next,
  readCorrectableRegistration = resubmissionService.readCorrectableRegistration,
) {
  response.json(await readCorrectableRegistration(request.params.token));
}

async function resubmit(
  request,
  response,
  next,
  resubmitRegistration = resubmissionService.resubmitRegistration,
) {
  response.json(await resubmitRegistration(request.params.token, request.body));
}

module.exports = { getCorrectionRequest, resubmit };
