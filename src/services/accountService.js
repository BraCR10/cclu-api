const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');

function isActive(account) {
  return account.accountStatus === ACCOUNT_STATUSES.ACTIVE;
}

// Two independent gates for a member. The application is history and stops
// changing once it is approved; the account status is the live switch an
// administrator throws to suspend someone.
const ACCOUNT_RULES = {
  [ROLES.MEMBER]: {
    find: (id) => Member.findById(id).select('accountStatus applicationStatus').lean(),
    isUsable: (account) =>
      isActive(account) && account.applicationStatus === APPLICATION_STATUSES.APPROVED,
  },
  [ROLES.ADMIN]: {
    find: (id) => Admin.findById(id).select('accountStatus').lean(),
    isUsable: isActive,
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

module.exports = { isIdentityUsable, ACCOUNT_RULES };
