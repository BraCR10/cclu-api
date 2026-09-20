const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MEMBER_STATES,
  effectiveMemberState,
  canUseAccount,
} = require('../../src/services/memberStatusService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');

const active = ACCOUNT_STATUSES.ACTIVE;
const suspended = ACCOUNT_STATUSES.SUSPENDED;

test('an application still being decided reads as under review, never as active', () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
  ]) {
    assert.equal(
      effectiveMemberState({ applicationStatus, accountStatus: active }),
      MEMBER_STATES.UNDER_REVIEW,
    );
  }
});

// This is the pair that reads wrong on the raw record: rejected and active at
// once. What a screen shows must be the second word, never the first.
test('a rejected application reads as rejected although the account was never suspended', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.REJECTED,
      accountStatus: active,
    }),
    MEMBER_STATES.REJECTED,
  );
});

test('a rejection outlives a later suspension', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.REJECTED,
      accountStatus: suspended,
    }),
    MEMBER_STATES.REJECTED,
  );
});

test('only an approved application that is not suspended reads as active', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.APPROVED,
      accountStatus: active,
    }),
    MEMBER_STATES.ACTIVE,
  );
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.APPROVED,
      accountStatus: suspended,
    }),
    MEMBER_STATES.SUSPENDED,
  );
});

test('exactly one state opens the door', () => {
  const combinations = [];

  for (const applicationStatus of Object.values(APPLICATION_STATUSES)) {
    for (const accountStatus of Object.values(ACCOUNT_STATUSES)) {
      combinations.push({ applicationStatus, accountStatus });
    }
  }

  const usable = combinations.filter(canUseAccount);

  assert.equal(usable.length, 1);
  assert.deepEqual(usable[0], {
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
  });
});
