const { APPLICATION_STATUSES } = require('../models/Member');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

// One value that answers what a person actually wants to know. accountStatus
// alone reads as "this account works", which is untrue for an application that
// was never approved, and it is the field a screen would reach for first.
const MEMBER_STATES = {
  UNDER_REVIEW: 'under_review',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected',
};

function effectiveMemberState(member) {
  if (member.applicationStatus === APPLICATION_STATUSES.REJECTED) {
    return MEMBER_STATES.REJECTED;
  }

  if (member.applicationStatus !== APPLICATION_STATUSES.APPROVED) {
    return MEMBER_STATES.UNDER_REVIEW;
  }

  return member.accountStatus === ACCOUNT_STATUSES.SUSPENDED
    ? MEMBER_STATES.SUSPENDED
    : MEMBER_STATES.ACTIVE;
}

// The single state that opens the door. Anything else is a reason it is shut.
function canUseAccount(member) {
  return effectiveMemberState(member) === MEMBER_STATES.ACTIVE;
}

module.exports = { MEMBER_STATES, effectiveMemberState, canUseAccount };
