const test = require('node:test');
const assert = require('node:assert/strict');
const {
  effectivePlan,
  grants,
  isTermCurrent,
  readEffectivePlan,
} = require('../../src/services/entitlementService');

const EXPIRES_AT = new Date('2026-11-18T06:00:00.000Z');
const FREE = {
  key: 'free',
  entitlements: { publishInMarketplace: false, publishJobs: false, banner: 'none' },
};
const PRO = {
  key: 'pro',
  entitlements: { publishInMarketplace: true, publishJobs: true, banner: 'one_month' },
};

function at(offsetInMilliseconds) {
  return new Date(EXPIRES_AT.getTime() + offsetInMilliseconds);
}

test('a paid plan holds until the millisecond before its expiry and not at it', () => {
  const membership = { plan: PRO, expiresAt: EXPIRES_AT };

  assert.equal(effectivePlan(membership, FREE, at(-1)).key, 'pro');
  assert.equal(effectivePlan(membership, FREE, at(0)).key, 'free');
  assert.equal(effectivePlan(membership, FREE, at(1)).key, 'free');
});

test('access ends at the expiry even if the job that moves the plan never runs', () => {
  const storedAsPro = { plan: PRO, expiresAt: EXPIRES_AT };
  const aYearLater = at(365 * 24 * 60 * 60 * 1000);

  assert.equal(grants(effectivePlan(storedAsPro, FREE, aYearLater), 'publishInMarketplace'), false);
});

test('a paid plan that cannot show a trustworthy expiry counts as Gratuita', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  for (const expiresAt of [null, undefined, new Date('nonsense'), '2027-01-01', 4102444800000]) {
    assert.equal(effectivePlan({ plan: PRO, expiresAt }, FREE, now).key, 'free');
  }
});

test('an expiry beyond the longest term is not trusted', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  assert.equal(isTermCurrent(new Date('2027-11-01T06:00:00Z'), now), true);
  assert.equal(isTermCurrent(new Date('2030-01-01T06:00:00Z'), now), false);
});

test('an unreadable current time grants nothing', () => {
  assert.equal(isTermCurrent(EXPIRES_AT, new Date('nonsense')), false);
  assert.equal(isTermCurrent(EXPIRES_AT, undefined), false);
});

test('Gratuita never expires', () => {
  const membership = { plan: FREE, expiresAt: null };

  assert.equal(effectivePlan(membership, FREE, at(0)), FREE);
});

test('an entitlement is granted only by its exact value', () => {
  assert.equal(grants(PRO, 'banner'), true);
  assert.equal(grants(FREE, 'banner'), false);
  assert.equal(grants({ entitlements: { publishJobs: 'true' } }, 'publishJobs'), false);
  assert.equal(grants({ entitlements: { banner: 'forever' } }, 'banner'), false);
  assert.equal(grants(PRO, 'toString'), false);
  assert.equal(grants(PRO, 'isAdmin'), false);
  assert.equal(grants(null, 'publishJobs'), false);
});

test('reading the effective plan returns Gratuita once the paid term is over', async () => {
  const store = {
    findMembership: async () => ({ plan: PRO, expiresAt: EXPIRES_AT }),
    findFreePlan: async () => FREE,
  };

  assert.equal((await readEffectivePlan('member', at(-1), store)).key, 'pro');
  assert.equal((await readEffectivePlan('member', at(0), store)).key, 'free');
});

test('a member with no membership holds Gratuita', async () => {
  const store = { findMembership: async () => null, findFreePlan: async () => FREE };

  assert.equal((await readEffectivePlan('member', at(0), store)).key, 'free');
});
