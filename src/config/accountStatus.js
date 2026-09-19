// Every account in the system answers the same question the same way: does it
// work right now. Member and Admin share these values so that suspending an
// account means one thing wherever it is read.
const ACCOUNT_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

module.exports = { ACCOUNT_STATUSES };
