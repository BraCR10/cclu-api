const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readListQuery,
  searchFilter,
  listMemberships,
} = require('../../src/services/adminMembershipService');

test('the list answers active memberships unless asked for the others', () => {
  assert.equal(readListQuery({}).status, 'active');
  assert.equal(readListQuery({ status: 'inactive' }).status, 'inactive');
});

test('a status, plan or search outside what the list offers is refused', () => {
  for (const query of [
    { status: 'expiring' },
    { status: ['active', 'inactive'] },
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

test('a lapsed member is shown with the plan that ran out and the day it ended', async () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const plans = [
    { _id: 'free-id', key: 'free', name: 'Gratuita' },
    { _id: 'pro-id', key: 'pro', name: 'Pro Pymex' },
  ];
  const lapsedOn = new Date('2026-10-08T06:00:00Z');
  const store = {
    findPlans: async () => plans,
    readNoticeDays: async () => 7,
    aggregate: async () => [
      {
        active: [{ count: 3 }],
        expiring: [{ count: 1 }],
        inactive: [{ count: 1 }],
        items: [
          {
            member: { _id: 'm1', businessName: 'Café Loma Verde', memberCode: 'MA7K2Q4' },
            plan: 'free-id',
            lapsed: { plan: 'pro-id', expiredAt: lapsedOn },
            endedAt: lapsedOn,
          },
        ],
      },
    ],
  };

  const answer = await listMemberships({ status: 'inactive' }, now, store);

  assert.deepEqual(answer.counts, { active: 3, expiring: 1, inactive: 1 });
  assert.equal(answer.total, 1);
  assert.equal(answer.noticeDays, 7);
  assert.deepEqual(answer.items[0].plan, { key: 'pro', name: 'Pro Pymex' });
  assert.equal(answer.items[0].memberCode, 'M-A7K2-Q4');
  assert.equal(answer.items[0].validUntil, '2026-10-07');
  assert.equal(answer.items[0].status, 'inactive');
});
