const { Member } = require('../models/Member');
const { hasPaidMembership } = require('../services/membershipService');
const { ValidationError, CODES } = require('../config/memberRules');

function findPaidUntil(memberId) {
  return Member.findById(memberId).select('paidUntil').lean();
}

// Sits after authorize(MEMBER) on every route that publishes content. The free
// membership reads everything and publishes nothing; that line is drawn here
// once instead of inside each service.
function requirePaidMembership(find = findPaidUntil) {
  return async function requirePaidMembershipCheck(request, response, next) {
    const member = await find(request.identity.id);

    if (!hasPaidMembership(member ?? {})) {
      throw new ValidationError(
        CODES.PAID_MEMBERSHIP_REQUIRED,
        null,
        'Publishing requires an active paid membership.',
        403,
      );
    }

    next();
  };
}

module.exports = { requirePaidMembership };
