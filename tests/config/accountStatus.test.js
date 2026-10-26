const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ADMIN_ACCOUNT_STATUSES,
  effectiveAdminState,
  canUseAdminAccount,
} = require('../../src/config/accountStatus');

const NOW = new Date('2026-10-25T12:00:00Z');

test('an invitation past its expiry reads as expired', () => {
  const admin = {
    accountStatus: ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING,
    invitationExpiresAt: new Date('2026-10-24T12:00:00Z'),
  };

  assert.equal(effectiveAdminState(admin, NOW), ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED);
});

// Administrators once shared the member values, so an account written then can
// still say "suspended". The panel only knows how to show its own states.
test('an administrator stored as suspended reads as inactive and stays locked out', () => {
  const admin = { accountStatus: 'suspended' };

  assert.equal(effectiveAdminState(admin, NOW), ADMIN_ACCOUNT_STATUSES.INACTIVE);
  assert.equal(canUseAdminAccount(admin, NOW), false);
});

test('a stored status the panel does not know reads as inactive', () => {
  assert.equal(
    effectiveAdminState({ accountStatus: 'unknown' }, NOW),
    ADMIN_ACCOUNT_STATUSES.INACTIVE,
  );
});

test('an active administrator stays active', () => {
  const admin = { accountStatus: ADMIN_ACCOUNT_STATUSES.ACTIVE };

  assert.equal(effectiveAdminState(admin, NOW), ADMIN_ACCOUNT_STATUSES.ACTIVE);
  assert.equal(canUseAdminAccount(admin, NOW), true);
});
