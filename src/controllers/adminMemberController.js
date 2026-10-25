const adminMemberService = require('../services/adminMemberService');

async function getMembers(request, response, next, list = adminMemberService.listMembers) {
  response.json(await list(request.query));
}

async function exportMembers(request, response, next, write = adminMemberService.exportMembers) {
  const csv = await write(request.query);

  response.type('text/csv').attachment('agremiados.csv').send(csv);
}

async function getMember(request, response, next, read = adminMemberService.readMember) {
  response.json(await read(request.params.memberId));
}

async function updateMember(request, response, next, update = adminMemberService.updateMember) {
  response.json(await update(request.params.memberId, request.body));
}

async function setMemberStatus(request, response, next, set = adminMemberService.setMemberStatus) {
  response.json(await set(request.identity, request.params.memberId, request.body));
}

module.exports = { getMembers, exportMembers, getMember, updateMember, setMemberStatus };
