const test = require('node:test');
const assert = require('node:assert/strict');
const { requireEntitlement } = require('../../src/middlewares/requireEntitlement');

const NOW = new Date('2026-10-17T12:00:00Z');
const PRO = { key: 'pro', entitlements: { publishInMarketplace: true } };
const FREE = { key: 'free', entitlements: { publishInMarketplace: false } };

function request() {
  return { identity: { id: 'member-1', role: 'member' } };
}

test('a misspelled entitlement stops the routes from being built', () => {
  assert.throws(() => requireEntitlement('publishInMarketPlace'), TypeError);
  assert.throws(() => requireEntitlement('constructor'), TypeError);
});

test('a plan that includes the entitlement lets the request through', async () => {
  let passed = false;
  const check = requireEntitlement(
    'publishInMarketplace',
    async () => PRO,
    () => NOW,
  );

  await check(request(), {}, () => {
    passed = true;
  });

  assert.equal(passed, true);
});

test('a plan without the entitlement is refused with a code the screen can explain', async () => {
  const check = requireEntitlement(
    'publishInMarketplace',
    async () => FREE,
    () => NOW,
  );

  await assert.rejects(
    check(request(), {}, () => assert.fail('must not pass')),
    { code: 'plan_required', statusCode: 403, reason: 'publishInMarketplace' },
  );
});

test('the plan is read for the member in the session, at the moment of the request', async () => {
  const reads = [];
  const check = requireEntitlement(
    'publishInMarketplace',
    async (memberId, now) => {
      reads.push({ memberId, now });
      return PRO;
    },
    () => NOW,
  );

  await check(request(), {}, () => {});

  assert.deepEqual(reads, [{ memberId: 'member-1', now: NOW }]);
});
