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
    findFreePlan: async () => FREE,
    grant: async () => {
      stored = { plan: FREE, startedAt: new Date(), expiresAt: null, lapsed: null };
    },
  };

  const membership = await readOwnMembership(MEMBER_ID, store);

  assert.equal(membership.plan.key, 'free');
  assert.equal(membership.memberCode, 'M-A7K2-Q4');
  assert.equal(membership.validUntil, null);
});

test('a paid plan past its expiry reads as Gratuita before the job has moved it', async () => {
  const pro = { key: 'pro', name: 'Pro Pymex', monthlyFee: 10000, entitlements: {} };
  const expiresAt = new Date('2026-11-18T06:00:00Z');
  const store = {
    findMember: async () => APPROVED,
    findMembership: async () => ({ plan: pro, startedAt: new Date(), expiresAt, lapsed: null }),
    findFreePlan: async () => FREE,
  };

  const before = await readOwnMembership(MEMBER_ID, store, new Date(expiresAt.getTime() - 1));
  const after = await readOwnMembership(MEMBER_ID, store, expiresAt);

  assert.equal(before.plan.key, 'pro');
  assert.equal(before.validUntil, '2026-11-17');
  assert.equal(before.expiresAt, expiresAt);
  assert.equal(after.plan.key, 'free');
  assert.equal(after.validUntil, null);
  assert.equal(after.expiresAt, null);
  assert.deepEqual(after.lapsed, {
    plan: { key: 'pro', name: 'Pro Pymex' },
    expiresAt,
    validUntil: '2026-11-17',
  });
});

test('a member who is not approved has no plan to read', async () => {
  const store = {
    findMember: async () => ({ applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW }),
    findMembership: async () => assert.fail('must not be read'),
    grant: async () => assert.fail('must not be granted'),
  };

  await assert.rejects(readOwnMembership(MEMBER_ID, store), { code: 'not_allowed' });
});

test('a paid plan refused for an untrustworthy expiry shows no date it ended on', async () => {
  const pro = { key: 'pro', name: 'Pro Pymex', monthlyFee: 10000, entitlements: {} };
  const store = {
    findMember: async () => APPROVED,
    findMembership: async () => ({
      plan: pro,
      startedAt: new Date(),
      expiresAt: new Date('2031-01-01T06:00:00Z'),
      lapsed: null,
    }),
    findFreePlan: async () => FREE,
  };

  const membership = await readOwnMembership(MEMBER_ID, store, new Date('2026-10-17T12:00:00Z'));

  assert.equal(membership.plan.key, 'free');
  assert.equal(membership.lapsed.expiresAt, null);
  assert.equal(membership.lapsed.validUntil, null);
});
