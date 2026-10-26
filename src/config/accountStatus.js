// Every account in the system answers the same question the same way: does it
// work right now. Member and Admin share these values so that suspending an
// account means one thing wherever it is read.
const ACCOUNT_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

// An administrator can be more things than a member can. The panel has no way to
// create itself, so an administrator arrives through an invitation, and an
// invitation is either not accepted yet or has run out of time.
const ADMIN_ACCOUNT_STATUSES = {
  ACTIVE: 'active',
  INVITATION_PENDING: 'invitation_pending',
  INVITATION_EXPIRED: 'invitation_expired',
  INACTIVE: 'inactive',
};

// Asked every time an administrator acts, rather than stored once and left to
// go stale: an invitation that ran out of time says so on its own, without
// anybody having to write the new state down.
function effectiveAdminState(admin, now = new Date()) {
  if (admin === null || admin === undefined) {
    return ADMIN_ACCOUNT_STATUSES.INACTIVE;
  }

  if (
    admin.accountStatus === ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING &&
    admin.invitationExpiresAt instanceof Date &&
    admin.invitationExpiresAt.getTime() <= now.getTime()
  ) {
    return ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED;
  }

  // Administrators once shared the member values, so an account written then
  // can still say "suspended". Anything the panel cannot show is not usable.
  return Object.values(ADMIN_ACCOUNT_STATUSES).includes(admin.accountStatus)
    ? admin.accountStatus
    : ADMIN_ACCOUNT_STATUSES.INACTIVE;
}

// The only state that opens the panel.
function canUseAdminAccount(admin, now = new Date()) {
  return effectiveAdminState(admin, now) === ADMIN_ACCOUNT_STATUSES.ACTIVE;
}

module.exports = {
  ACCOUNT_STATUSES,
  ADMIN_ACCOUNT_STATUSES,
  effectiveAdminState,
  canUseAdminAccount,
};
