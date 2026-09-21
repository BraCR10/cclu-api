const adminMemberManagementService = require('../services/adminMemberManagementService');

async function listMembers(
  request,
  response,
  next,
  readMembers = adminMemberManagementService.readMembers,
) {
  response.json(await readMembers());
}

async function updateMemberStatus(
  request,
  response,
  next,
  updateStatus = adminMemberManagementService.updateMemberStatus,
) {
  response.json(await updateStatus(request.params.memberId, request.body));
}

async function updateMembership(
  request,
  response,
  next,
  updateMembership = adminMemberManagementService.updateMembership,
) {
  response.json(await updateMembership(request.params.memberId, request.body));
}

module.exports = { listMembers, updateMemberStatus, updateMembership };
