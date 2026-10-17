const membershipService = require('../services/membershipService');

// The member comes from the session, never from the request, so nobody can
// read a membership other than their own.
async function getOwnMembership(
  request,
  response,
  next,
  readOwnMembership = membershipService.readOwnMembership,
) {
  response.json(await readOwnMembership(request.identity.id));
}

module.exports = { getOwnMembership };
