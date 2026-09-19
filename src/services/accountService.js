const { Agremiado, APPLICATION_STATUSES } = require('../models/Agremiado');
const { Administrador } = require('../models/Administrador');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');

function isActive(account) {
  return account.accountStatus === ACCOUNT_STATUSES.ACTIVA;
}

// Two independent gates for an agremiado. The application is history and stops
// changing once it is approved; the account status is the live switch an
// administrator throws under CA-ADM-003-03.
const ACCOUNT_RULES = {
  [ROLES.AGREMIADO]: {
    find: (id) => Agremiado.findById(id).select('accountStatus applicationStatus').lean(),
    isUsable: (account) =>
      isActive(account) && account.applicationStatus === APPLICATION_STATUSES.APPROVED,
  },
  [ROLES.ADMINISTRADOR]: {
    find: (id) => Administrador.findById(id).select('accountStatus').lean(),
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
