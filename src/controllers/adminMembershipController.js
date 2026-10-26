const clock = require('../config/clock');
const adminMembershipService = require('../services/adminMembershipService');
const settingsService = require('../services/settingsService');

async function getMemberships(
  request,
  response,
  next,
  listMemberships = adminMembershipService.listMemberships,
) {
  response.json(await listMemberships(request.query, clock.now()));
}

async function getPolicy(request, response, next, readPolicy = settingsService.readPolicy) {
  response.json(await readPolicy());
}

// The administrator comes from the session, so the audit entry names who
// actually made the change.
async function updatePolicy(
  request,
  response,
  next,
  changeNoticeDays = settingsService.changeNoticeDays,
) {
  response.json(await changeNoticeDays(request.identity, request.body));
}

module.exports = { getMemberships, getPolicy, updatePolicy };
