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
  TERMINATED: 'terminated',
};

function effectiveMemberState(member) {
  if (member.applicationStatus === APPLICATION_STATUSES.REJECTED) {
    return MEMBER_STATES.REJECTED;
  }

  if (member.applicationStatus !== APPLICATION_STATUSES.APPROVED) {
    return MEMBER_STATES.UNDER_REVIEW;
  }

  if (member.accountStatus === ACCOUNT_STATUSES.TERMINATED) {
    return MEMBER_STATES.TERMINATED;
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
      const admin = await Admin.findById(id).select('name email').lean();

      // The address stands in where no name was stored, so a screen always has
      // something to greet somebody by.
      return admin === null ? null : { email: admin.email, displayName: admin.name || admin.email };
    },
  },
};

// An index is unique inside one collection, and an address belongs to two of
// them. Neither index can refuse what the other already holds, so this rule is
// asked rather than enforced, and that is genuinely weaker: two writes landing
// at the same instant can still pass each other. Making it a guarantee would
// take one collection holding every address, which is a change to the model.
const EMAIL_HOLDERS = {
  [ROLES.MEMBER]: (email) => Member.exists({ email }),
  [ROLES.ADMIN]: (email) => Admin.exists({ email }),
};

// Normalised here rather than trusted to the schema, which applies its own
// lowercasing when a document is saved and not necessarily when one is sought.
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function emailHeldByAnotherRole(email, role, holders = EMAIL_HOLDERS) {
  const address = normalizeEmail(email);

  if (address === '') {
    return false;
  }

  const others = Object.entries(holders).filter(([held]) => held !== role);
  const found = await Promise.all(others.map(([, holds]) => holds(address)));

  return found.some(Boolean);
}

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
  emailHeldByAnotherRole,
  normalizeEmail,
  EMAIL_HOLDERS,
  isIdentityUsable,
  describeCurrentAccount,
  effectiveMemberState,
  canUseAccount,
  MEMBER_STATES,
  ACCOUNT_RULES,
};