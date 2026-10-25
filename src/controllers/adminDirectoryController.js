const adminDirectoryService = require('../services/adminDirectoryService');

const { listAdmins, inviteAdmin, resendInvitation, setAdminStatus } = adminDirectoryService;

async function getAdmins(request, response, next, list = listAdmins) {
  response.json(await list());
}

async function invite(request, response, next, create = inviteAdmin) {
  response.status(201).json(await create(request.identity.id, request.body));
}

async function resend(request, response, next, again = resendInvitation) {
  response.json(await again(request.identity.id, request.params.adminId));
}

async function setStatus(request, response, next, set = setAdminStatus) {
  response.json(await set(request.identity.id, request.params.adminId, request.body));
}

module.exports = { getAdmins, invite, resend, setStatus };
