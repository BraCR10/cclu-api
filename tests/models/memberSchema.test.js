const test = require('node:test');
const assert = require('node:assert/strict');
const { Member, APPLICATION_STATUSES } = require('../../src/models/Member');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { CORRECTABLE_FIELDS } = require('../../src/services/resubmissionService');

// mongoose drops any path a schema does not declare, without complaining and
// without a failing write, so a decision that stored its reason or the fields it
// asked for would lose them in silence. Every path a decision writes is named
// here.
const DECISION_PATHS = [
  'applicationStatus',
  'statusReason',
  'changesRequestedFields',
  'reviewedBy',
  'reviewedAt',
  'memberCode',
  'resubmissionTokenHash',
  'resubmissionExpiresAt',
];

test('every path a decision writes is declared by the schema', () => {
  for (const path of DECISION_PATHS) {
    assert.ok(Member.schema.path(path) !== undefined, `${path} is not declared`);
  }
});

// The same silence would swallow what a correction writes, which is the whole
// list the form may show.
test('every field a correction may touch is declared by the schema', () => {
  for (const path of CORRECTABLE_FIELDS) {
    assert.ok(Member.schema.path(path) !== undefined, `${path} is not declared`);
  }
});

test('an application starts pending and its account active', () => {
  const document = new Member();

  assert.equal(document.applicationStatus, APPLICATION_STATUSES.PENDING_REVIEW);
  assert.equal(document.accountStatus, ACCOUNT_STATUSES.ACTIVE);
});

test('an application can only be in one of the four states', () => {
  const allowed = Member.schema.path('applicationStatus').enumValues;

  assert.deepEqual(allowed.sort(), Object.values(APPLICATION_STATUSES).sort());
  assert.deepEqual(Object.values(APPLICATION_STATUSES).sort(), [
    APPLICATION_STATUSES.APPROVED,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.REJECTED,
  ]);
});

// The lookup that opens a correction link goes through this index, and a
// non-sparse one would carry an entry for every member who never had a link.
test('the digest a link is looked up by is indexed and sparse', () => {
  const index = Member.schema
    .indexes()
    .find(([paths]) => Object.keys(paths).includes('resubmissionTokenHash'));

  assert.ok(index !== undefined);
  assert.deepEqual(index[1].sparse, true);
});
