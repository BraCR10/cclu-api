const test = require('node:test');
const assert = require('node:assert/strict');
const { listReports, readReport, exportReport } = require('../../src/services/reportService');

const NOW = new Date('2026-10-21T18:00:00Z');
const FUTURE = new Date('2026-12-01T06:00:00Z');
const PAST = new Date('2026-10-01T06:00:00Z');
const CANTON = '6aaf2cf895dc1da3c7333013';

function member(id, businessName, extra = {}) {
  return {
    _id: id,
    businessName,
    memberCode: id.toUpperCase(),
    memberType: 'business',
    district: 'San Juan',
    accountStatus: 'active',
    reviewedAt: new Date('2026-10-10T15:00:00Z'),
    ...extra,
  };
}

function storeWith({ members = [], memberships = [], payments = [] } = {}) {
  const calls = { members: [] };

  return {
    calls,
    findMembers: async (filter) => {
      calls.members.push(filter);
      return members;
    },
    findMemberships: async () => memberships,
    findPayments: async () => payments,
    findVacancies: async () => [],
    findSubscribers: async () => [],
    readNoticeDays: async () => 7,
    findPublishingMembers: async () => [],
  };
}

const MEMBERS = [
  member('clu001', 'Café Loma Verde'),
  member('clu002', 'Ferretería El Carmen'),
  member('clu003', 'Soda La Pradera'),
];

const MEMBERSHIPS = [
  { member: 'clu001', plan: { key: 'pro', name: 'Pro Pymex' }, expiresAt: FUTURE },
  { member: 'clu002', plan: { key: 'premium', name: 'Premium Empresarial' }, expiresAt: PAST },
  { member: 'clu003', plan: { key: 'free', name: 'Gratuita' }, expiresAt: null },
];

test('the catalog offers every report and marks those over publications not built yet', () => {
  const { items } = listReports();

  assert.equal(items.length, 11);
  assert.deepEqual(
    items.filter((item) => !item.available).map((item) => item.type),
    ['products', 'promotions', 'discounts'],
  );
});

test('a paid plan whose term ran out does not count as paid', async () => {
  const report = await readReport(
    'paidMembers',
    {},
    NOW,
    storeWith({ members: MEMBERS, memberships: MEMBERSHIPS }),
  );

  assert.equal(report.total, 1);
  assert.equal(report.items[0][0], 'Café Loma Verde');
  assert.deepEqual(report.summary[0], { label: 'Total', value: '1' });
});

test('the free members report holds Gratuita and lapsed paid plans', async () => {
  const report = await readReport(
    'freeMembers',
    {},
    NOW,
    storeWith({ members: MEMBERS, memberships: MEMBERSHIPS }),
  );

  assert.deepEqual(
    report.items.map((row) => row[0]),
    ['Ferretería El Carmen', 'Soda La Pradera'],
  );
});

test('the payments of the period add up their amounts in colones', async () => {
  const payments = [
    {
      member: MEMBERS[0],
      planName: 'Pro Pymex',
      frequency: 'monthly',
      amount: 10000,
      decidedAt: NOW,
    },
    {
      member: MEMBERS[1],
      planName: 'Lite MiPyme',
      frequency: 'annual',
      amount: 60000,
      decidedAt: NOW,
    },
  ];

  const report = await readReport('periodPayments', {}, NOW, storeWith({ payments }));

  assert.deepEqual(report.summary, [
    { label: 'Pagos aprobados', value: '2' },
    { label: 'Monto total', value: '₡70.000' },
  ]);
});

test('a filter a report does not take never narrows it', async () => {
  const store = storeWith({ members: MEMBERS, memberships: MEMBERSHIPS });

  await readReport('paidMembers', { accountStatus: 'suspended', canton: CANTON }, NOW, store);

  assert.equal(store.calls.members[0].accountStatus, undefined);
  assert.equal(String(store.calls.members[0].canton), CANTON);
});

test('the CSV and the PDF carry the rows the preview pages through', async () => {
  const store = storeWith({ members: MEMBERS, memberships: MEMBERSHIPS });

  const csv = await exportReport('members', { format: 'csv' }, NOW, store);
  const pdf = await exportReport('members', { format: 'pdf' }, NOW, store);

  for (const name of ['Café Loma Verde', 'Ferretería El Carmen', 'Soda La Pradera']) {
    assert.match(csv.body, new RegExp(name));
  }
  assert.equal(csv.name, 'reporte-members.csv');
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
});

test('an unknown report is a not found and an unknown format is refused', async () => {
  await assert.rejects(readReport('nothing', {}, NOW, storeWith()), { statusCode: 404 });
  await assert.rejects(exportReport('members', { format: 'xls' }, NOW, storeWith()), {
    statusCode: 400,
  });
});

test('a range that ends before it starts is refused', async () => {
  await assert.rejects(
    readReport('newMembers', { from: '2026-10-20', to: '2026-10-01' }, NOW, storeWith()),
    { statusCode: 400 },
  );
});
