const memberProfileService = require('../services/memberProfileService');
const memberVerificationService = require('../services/memberVerificationService');
const memberLogoService = require('../services/memberLogoService');

async function getOwnProfile(
  request,
  response,
  next,
  readProfile = memberProfileService.readProfile,
) {
  response.json(await readProfile(request.identity.id));
}

// The identity comes from the session, never from the body, so a member can
// only ever edit the account they signed in with.
async function updateOwnProfile(
  request,
  response,
  next,
  updateProfile = memberProfileService.updateProfile,
) {
  response.json(await updateProfile(request.identity.id, request.body));
}

async function verifyCode(
  request,
  response,
  next,
  verifyMemberCode = memberVerificationService.verifyMemberCode,
) {
  response.json(await verifyMemberCode(request.body));
}

// The member's own membership. Read from the session, never from the path, so
// a member can only ever see the membership attached to the account they
// signed in with.
async function getOwnMembership(
  request,
  response,
  next,
  readMembership = memberProfileService.readMembership,
) {
  response.json(await readMembership(request.identity.id));
}

// Public, and resolved by the code a card carries. Nothing here reads a
// session, so the answer is the same for everyone who scans it.
async function getPublicProfile(
  request,
  response,
  next,
  readPublicProfile = memberVerificationService.readPublicProfile,
) {
  response.json(await readPublicProfile(request.params.memberCode));
}

async function uploadOwnLogo(request, response, next, uploadLogo = memberLogoService.uploadLogo) {
  response.json(await uploadLogo(request.identity.id, request.body));
}

async function deleteOwnLogo(request, response, next, deleteLogo = memberLogoService.deleteLogo) {
  await deleteLogo(request.identity.id);
  response.status(204).end();
}

module.exports = {
  getOwnProfile,
  updateOwnProfile,
  verifyCode,
  getPublicProfile,
  getOwnMembership,
  uploadOwnLogo,
  deleteOwnLogo,
};
