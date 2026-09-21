const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../../src/services/reportService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const NOW = new Date('2026-09-21T12:00:00.000Z');
const now = () => NOW;

function memberRow(overrides = {}) {
  return {
    _id: MEMBER_ID,
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    paidUntil: new Date('2026-10-21T00:00:00.000Z'),
    canton: { name: 'La Unión' },
    sector: { name: 'Comercio' },
    ...overrides,
  };
}

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a report type outside the seven is refused', async () => {
  for (const type of [undefined, 'everything', 'admins']) {
    const error = await refusal(() => buildReport({ type }));

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'type');
  }
});

test('the member reports split by membership without asking twice', async () => {
  const members = async () => [
    memberRow(),
    memberRow({ _id: 'x', businessName: 'Vencido', paidUntil: new Date('2026-01-01') }),
  ];

  const all = await buildReport({ type: 'members' }, members, undefined, undefined, now);
  const paid = await buildReport({ type: 'paid_members' }, members, undefined, undefined, now);
  const unpaid = await buildReport({ type: 'unpaid_members' }, members, undefined, undefined, now);

  assert.equal(all.total, 2);
  assert.deepEqual(
    paid.rows.map((row) => row.businessName),
    ['Panadería Tres Ríos'],
  );
  assert.deepEqual(
    unpaid.rows.map((row) => row.businessName),
    ['Vencido'],
  );
  assert.equal(paid.rows[0].membership, 'paid');
  assert.equal(paid.rows[0].canton, 'La Unión');
});

test('the territory filter travels into the member query', async () => {
  const asked = [];
  const members = async (filter) => {
    asked.push(filter);
    return [];
  };

  await buildReport(
    { type: 'members', canton: MEMBER_ID, sector: 'not-an-id' },
    members,
    undefined,
    undefined,
    now,
  );

  assert.deepEqual(asked[0], { canton: MEMBER_ID });
});

test('a publication report counts only what the public can see', async () => {
  const askedOwners = [];
  const askedFinds = [];

  const report = await buildReport(
    { type: 'promotions', canton: MEMBER_ID },
    undefined,
    async (territory) => {
      askedOwners.push(territory);
      return [MEMBER_ID];
    },
    async (definition, owners) => {
      askedFinds.push({ headline: definition.headline, owners });
      return [
        {
          member: { businessName: 'Panadería', canton: { name: 'La Unión' }, sector: null },
          title: '2x1',
          validUntil: new Date('2026-09-30'),
          createdAt: NOW,
        },
      ];
    },
    now,
  );

  assert.deepEqual(askedOwners[0], { canton: MEMBER_ID, sector: undefined });
  assert.deepEqual(askedFinds[0].owners, [MEMBER_ID]);
  assert.equal(report.total, 1);
  assert.equal(report.rows[0].title, '2x1');
  assert.equal(report.rows[0].businessName, 'Panadería');
  assert.equal(report.rows[0].sector, null);
});

test('a jobs report row carries no validity, having none', async () => {
  const report = await buildReport(
    { type: 'jobs' },
    undefined,
    async () => [MEMBER_ID],
    async () => [
      {
        member: { businessName: 'Panadería', canton: null, sector: { name: 'Comercio' } },
        title: 'Panadero',
        createdAt: NOW,
      },
    ],
    now,
  );

  assert.equal(report.rows[0].validUntil, null);
  assert.equal(report.rows[0].sector, 'Comercio');
});
