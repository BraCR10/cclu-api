const adminInvitationService = require('../services/adminInvitationService.js');

async function inviteAdministrator(
  request,
  response,
  next,
  invite = adminInvitationService.inviteAdministrator,
) {
  response.status(201).json(await invite(request.identity, request.body));
}

async function updateAdministrator(
  request,
  response,
  next,
  update = adminInvitationService.updateAdministrator,
) {
  response.json(await update(request.identity, request.params.administratorId, request.body));
}

async function updateAdministratorStatus(
  request,
  response,
  next,
  updateStatus = adminInvitationService.updateAdministratorStatus,
) {
  response.json(await updateStatus(request.identity, request.params.administratorId, request.body));
}

async function acceptInvitation(
  request,
  response,
  next,
  accept = adminInvitationService.acceptInvitation,
) {
  response.json(await accept(request.params.invitationId, request.body));
}

module.exports = {
  inviteAdministrator,
  updateAdministrator,
  updateAdministratorStatus,
  acceptInvitation,
};
