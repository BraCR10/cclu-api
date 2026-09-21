const membershipService = require('../services/membershipService');

// Read by member and administrator alike: the fee is what the member is about
// to be asked to pay, and what the administrator configured.
async function getFee(request, response, next, readMonthlyFee = membershipService.readMonthlyFee) {
  response.json(await readMonthlyFee());
}

async function updateFee(
  request,
  response,
  next,
  updateMonthlyFee = membershipService.updateMonthlyFee,
) {
  response.json(await updateMonthlyFee(request.body));
}

async function getOwnMembership(
  request,
  response,
  next,
  readOwnMembership = membershipService.readOwnMembership,
) {
  response.json(await readOwnMembership(request.identity.id));
}

module.exports = { getFee, updateFee, getOwnMembership };
