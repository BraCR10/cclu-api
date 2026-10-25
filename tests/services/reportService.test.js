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

function storeWith({
  members = [],
  memberships = [],
  payments = [],
  publications = [],
  publishing = [],
} = {}) {
  const calls = { members: [], publications: [] };

  return {
    calls,
    findMembers: async (filter) => {
      calls.members.push(filter);
      return members;
    },
    findMemberships: async () => memberships,
    findPayments: async () => payments,
    findVacancies: async () => [],
    findPublications: async (filter) => {
      calls.publications.push(filter);
      return publications;
    },
    findSubscribers: async () => [],
    readNoticeDays: async () => 7,
    findPublishingMembers: async () => publishing,
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

test('the catalog offers the eleven reports the chamber asked for, all of them available', () => {
  const { items } = listReports();

  assert.equal(items.length, 11);
  assert.equal(
    items.every((item) => item.available),
    true,
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

function publication(id, type, title, extra = {}) {
  return {
    _id: id,
    type,
    title,
    price: type === 'product' || type === 'service' ? 5500 : null,
    percentage: type === 'discount' ? 15 : null,
    condition: type === 'discount' ? 'Con la tarjeta de la cámara' : null,
    status: 'active',
    removedAt: null,
    startsAt: null,
    endsAt: null,
    publishedAt: new Date('2026-10-15T15:00:00Z'),
    category: { name: 'Cafeterías' },
    member: {
      _id: 'clu001',
      businessName: 'Café Loma Verde',
      district: 'San Juan',
      canton: CANTON,
    },
    ...extra,
  };
}

test('the products report holds the products and the services, and counts each', async () => {
  const publications = [
    publication('pub1', 'product', 'Café molido 500 g'),
    publication('pub2', 'service', 'Reparación de bomba', {
      publishedAt: new Date('2026-10-10T15:00:00Z'),
    }),
    // Offered by a business whose plan stopped publishing: the marketplace no
    // longer shows it, so the report does not count it either.
    publication('pub3', 'product', 'Café verde', {
      member: { _id: 'clu009', businessName: 'Soda La Pradera', district: 'San Juan' },
    }),
  ];
  const store = storeWith({ publications, publishing: ['clu001'] });

  const report = await readReport('products', {}, NOW, store);

  assert.deepEqual(report.summary, [
    { label: 'Total', value: '2' },
    { label: 'Productos', value: '1' },
    { label: 'Servicios', value: '1' },
  ]);
  assert.deepEqual(
    report.items.map((row) => [row[0], row[2], row[4]]),
    [
      ['Café molido 500 g', 'Producto', '₡5.500'],
      ['Reparación de bomba', 'Servicio', '₡5.500'],
    ],
  );
});

// Same question as the marketplace, asked of the database: what is on offer.
test('the publication reports only read what is on offer', async () => {
  const store = storeWith();

  await readReport('promotions', {}, NOW, store);

  const filter = store.calls.publications[0];

  assert.deepEqual(filter.type, { $in: ['promotion'] });
  assert.equal(filter.status, 'active');
  assert.equal(filter.removedAt, null);
  assert.deepEqual(filter.$and, [
    { $or: [{ startsAt: null }, { startsAt: { $lte: NOW } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gte: NOW } }] },
  ]);
});

test('the discounts report says how much comes off and on what condition', async () => {
  const store = storeWith({
    publications: [publication('pub1', 'discount', '15 % en el almuerzo')],
    publishing: ['clu001'],
  });

  const report = await readReport('discounts', {}, NOW, store);

  assert.deepEqual(report.items[0].slice(0, 5), [
    '15 % en el almuerzo',
    'Café Loma Verde',
    'San Juan',
    '15 %',
    'Con la tarjeta de la cámara',
  ]);
});
