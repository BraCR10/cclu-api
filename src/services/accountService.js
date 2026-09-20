const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');

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

// The single state that opens the door. Anything else is a reason it is shut,
// and the gate below reads this rather than repeating the rule.
function canUseAccount(member) {
  return effectiveMemberState(member) === MEMBER_STATES.ACTIVE;
}

// Two gates for a member and one for an administrator, who has no application
// behind them.
const ACCOUNT_RULES = {
  [ROLES.MEMBER]: {
    find: (id) => Member.findById(id).select('accountStatus applicationStatus').lean(),
    isUsable: canUseAccount,
    describe: async (id) => {
      const member = await Member.findById(id)
        .select('email businessName memberCode applicationStatus accountStatus')
        .lean();

      return member === null
        ? null
        : {
            email: member.email,
            displayName: member.businessName,
            memberCode: member.memberCode ?? null,
            state: effectiveMemberState(member),
          };
    },
  },

  [ROLES.ADMIN]: {
    find: (id) => Admin.findById(id).select('accountStatus').lean(),
    isUsable: (account) => account.accountStatus === ACCOUNT_STATUSES.ACTIVE,
    describe: async (id) => {
      const admin = await Admin.findById(id).select('email').lean();

      return admin === null ? null : { email: admin.email, displayName: admin.email };
    },
  },
};

async function isIdentityUsable(identity, rules = ACCOUNT_RULES) {
  const rule = rules[identity?.role];

  if (rule === undefined) {
    return false;
  }

  const account = await rule.find(identity.id);

  if (!account) {
    return false;
  }

  return rule.isUsable(account);
}

// What a signed in person may be shown about themselves. The session carries
// only an identifier and a role, which is not enough to greet anyone by name.
async function describeCurrentAccount(identity, rules = ACCOUNT_RULES) {
  const rule = rules[identity?.role];

  if (rule === undefined) {
    return null;
  }

  const details = await rule.describe(identity.id);

  return details === null ? null : { id: identity.id, role: identity.role, ...details };
}

module.exports = {
  isIdentityUsable,
  describeCurrentAccount,
  effectiveMemberState,
  canUseAccount,
  MEMBER_STATES,
  ACCOUNT_RULES,
};
