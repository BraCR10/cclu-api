const memberRegistrationService = require('../services/memberRegistrationService');

async function signUp(
  request,
  response,
  next,
  registerMember = memberRegistrationService.registerMember,
) {
  const member = await registerMember(request.body);

  // Nothing about the new registration comes back beyond its identifier. It is
  // pending review, so there is nothing yet that anyone is entitled to read.
  response.status(201).json(member);
}

module.exports = { signUp };
