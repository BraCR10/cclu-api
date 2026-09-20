const adminProfileService = require('../services/adminProfileService');

async function getOwnProfile(
  request,
  response,
  next,
  readOwnProfile = adminProfileService.readOwnProfile,
) {
  response.json(await readOwnProfile(request.identity));
}

async function updateOwnProfile(
  request,
  response,
  next,
  update = adminProfileService.updateOwnProfile,
) {
  response.json(await update(request.identity, request.body));
}

module.exports = { getOwnProfile, updateOwnProfile };
