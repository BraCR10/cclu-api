const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readListQuery,
  viewFilters,
  searchFilter,
  listMemberships,
} = require('../../src/services/adminMembershipService');

test('the list shows every active membership unless asked for those expiring', () => {
  assert.equal(readListQuery({}).view, 'active');
  assert.equal(readListQuery({ view: 'expiring' }).view, 'expiring');
});

test('a view, plan or search outside what the list offers is refused', () => {
  for (const query of [
    { view: 'inactive' },
    { view: ['active', 'expiring'] },
    { plan: 'free' },
    { plan: 'gold' },
    { plan: { $ne: null } },
    { search: ['a', 'b'] },
    { search: 'x'.repeat(101) },
  ]) {
    assert.throws(() => readListQuery(query), { name: 'ValidationError' }, JSON.stringify(query));
  }
});

test('a search is read as the characters typed, never as a pattern', () => {
  const filter = searchFilter('.*(Café)+');
  const [byName] = filter.$or;

  assert.equal(byName['member.businessName'].$regex, '\\.\\*\\(Café\\)\\+');
});

test('a code is matched from its start with the dashes ignored', () => {
  const filter = searchFilter('m-a7k2');
  const byCode = filter.$or.find((condition) => 'member.memberCode' in condition);

  assert.equal(byCode['member.memberCode'].$regex, '^MA7K2');
});

test('an active membership is listed with its plan and the last day it is valid', async () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const plans = [
    { _id: 'free-id', key: 'free', name: 'Gratuita' },
    { _id: 'pro-id', key: 'pro', name: 'Pro Pymex' },
  ];
  const store = {
    findPlans: async () => plans,
    readNoticeDays: async () => 7,
    aggregate: async () => [
      {
        active: [{ count: 3 }],
        expiring: [{ count: 1 }],
        items: [
          {
            member: { _id: 'm1', businessName: 'Café Loma Verde', memberCode: 'MA7K2Q4' },
            plan: 'pro-id',
            expiresAt: new Date('2026-10-23T06:00:00Z'),
            frequency: 'monthly',
          },
        ],
      },
    ],
  };

  const answer = await listMemberships({ view: 'expiring' }, now, store);

  assert.deepEqual(answer.counts, { active: 3, expiring: 1 });
  assert.equal(answer.total, 1);
  assert.equal(answer.noticeDays, 7);
  assert.deepEqual(answer.items[0].plan, { key: 'pro', name: 'Pro Pymex' });
  assert.equal(answer.items[0].memberCode, 'M-A7K2-Q4');
  assert.equal(answer.items[0].validUntil, '2026-10-22');
  assert.equal('status' in answer.items[0], false);
});

test('only paid plans in force are listed, and expiring is the part that ends within the notice', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const filters = viewFilters(now, 7, 'free-id', null);

  assert.deepEqual(filters.active.plan, { $ne: 'free-id' });
  assert.equal(filters.active.expiresAt.$gt, now);
  assert.equal(filters.expiring.expiresAt.$lte.toISOString(), '2026-10-27T12:00:00.000Z');
});
