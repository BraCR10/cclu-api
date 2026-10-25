const test = require('node:test');
const assert = require('node:assert/strict');
const { readSummary, membershipsByPlan } = require('../../src/services/adminSummaryService');

const NOW = new Date('2026-10-20T12:00:00Z');
const PLANS = [
  { _id: 'p-pro', key: 'pro', name: 'Pro Pymex' },
  { _id: 'p-free', key: 'free', name: 'Gratuita' },
  { _id: 'p-premium', key: 'premium', name: 'Premium Empresarial' },
  { _id: 'p-lite', key: 'lite', name: 'Lite MiPyme' },
];

test('everybody listed without a paid plan in force counts as Gratuita, in plan order', () => {
  const counts = membershipsByPlan(
    PLANS,
    [
      { _id: 'p-pro', count: 3 },
      { _id: 'p-lite', count: 2 },
    ],
    10,
  );

  assert.deepEqual(
    counts.map((plan) => [plan.key, plan.count]),
    [
      ['free', 5],
      ['lite', 2],
      ['pro', 3],
      ['premium', 0],
    ],
  );
});

test('the summary reads the pending work and the paid memberships of this month', async () => {
  const since = [];
  const store = {
    findPlans: async () => PLANS,
    listedMemberIds: async () => ['m1', 'm2'],
    countMembers: async (filter) => (filter.reviewedAt ? 1 : 2),
    countPaidByPlan: async (memberIds, paidPlanIds, now, monthStart) => {
      since.push(monthStart);
      assert.ok(!paidPlanIds.includes('p-free'));
      return [{ _id: 'p-pro', count: 1, startedThisMonth: 1 }];
    },
    countPendingApplications: async () => 6,
    oldestPendingApplication: async () => ({ createdAt: new Date('2026-09-24T15:00:00Z') }),
    countPendingPayments: async () => 0,
    oldestPendingPayment: async () => null,
    listExpiring: async () => ({ items: [], total: 0, noticeDays: 7 }),
    countVacancies: async () => 9,
    countPublications: async () => 24,
  };

  const summary = await readSummary(NOW, store);

  assert.deepEqual(summary.members, { total: 2, newThisMonth: 1 });
  assert.equal(summary.applications.pending, 6);
  assert.equal(summary.payments.oldestSubmittedAt, null);
  assert.deepEqual(summary.paidMemberships, { active: 1, newThisMonth: 1 });
  assert.deepEqual(summary.publications, { active: 24 });
  assert.equal(summary.vacancies.active, 9);
  // October begins at midnight in Costa Rica, six hours after midnight UTC.
  assert.equal(since[0].toISOString(), '2026-10-01T06:00:00.000Z');
});
