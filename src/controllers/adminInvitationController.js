const adminInvitationService = require('../services/adminInvitationService');

const { readInvitation, acceptInvitation } = adminInvitationService;

// Public on purpose: the person holding the link has no account to sign in with
// yet, which is exactly what the link exists for.
async function getInvitation(request, response, next, read = readInvitation) {
  response.json(await read(request.params.token));
}

async function accept(request, response, next, acceptInvitationWith = acceptInvitation) {
  response.json(await acceptInvitationWith(request.params.token, request.body));
}

module.exports = { getInvitation, accept };
