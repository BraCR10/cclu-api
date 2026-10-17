const test = require('node:test');
const assert = require('node:assert/strict');
const { Membership } = require('../../src/models/Membership');
const { grantFreeMembership, readOwnMembership } = require('../../src/services/membershipService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');

const MEMBER_ID = '64b7f0a1c2d3e4f5a6b7c8d9';
const FREE = {
  key: 'free',
  name: 'Gratuita',
  monthlyFee: 0,
  entitlements: { publishInMarketplace: false },
};
const APPROVED = { memberCode: 'MA7K2Q4', applicationStatus: APPLICATION_STATUSES.APPROVED };

test('granting Gratuita only writes when the member has no membership yet', async (context) => {
  const writes = [];
  context.mock.method(Membership, 'updateOne', async (filter, update, options) => {
    writes.push({ filter, update, options });
  });

  await grantFreeMembership(MEMBER_ID, new Date(), async () => ({ _id: 'plan-free' }));

  const [{ filter, update, options }] = writes;
  assert.deepEqual(filter, { member: MEMBER_ID });
  assert.equal(update.$set, undefined);
  assert.equal(update.$setOnInsert.plan, 'plan-free');
  assert.equal(options.upsert, true);
});

test('two grants racing each other leave one membership and no error', async (context) => {
  context.mock.method(Membership, 'updateOne', async () => {
    const duplicate = new Error('E11000 duplicate key error');
    duplicate.code = 11000;
    throw duplicate;
  });

  await grantFreeMembership(MEMBER_ID, new Date(), async () => ({ _id: 'plan-free' }));
});

test('a member without a membership is granted Gratuita when they first ask', async () => {
  let stored = null;
  const store = {
    findMember: async () => APPROVED,
    findMembership: async () => stored,
    grant: async () => {
      stored = { plan: FREE, startedAt: new Date(), expiresAt: null, lapsed: null };
    },
  };

  const membership = await readOwnMembership(MEMBER_ID, store);

  assert.equal(membership.plan.key, 'free');
  assert.equal(membership.memberCode, 'M-A7K2-Q4');
  assert.equal(membership.expiresAt, null);
});

test('a member who is not approved has no plan to read', async () => {
  const store = {
    findMember: async () => ({ applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW }),
    findMembership: async () => assert.fail('must not be read'),
    grant: async () => assert.fail('must not be granted'),
  };

  await assert.rejects(readOwnMembership(MEMBER_ID, store), { code: 'not_allowed' });
});
