const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readDirectoryQuery,
  listPipeline,
  presentListing,
  listDirectory,
  listDistricts,
  featuredOrder,
} = require('../../src/services/directoryService');

const NOW = new Date('2026-10-20T12:00:00Z');
const CANTON = '6aaf2cf895dc1da3c7333013';

function firstMatch(query) {
  return listPipeline(readDirectoryQuery(query))[0].$match;
}

test('only approved members whose account is not suspended are listed', () => {
  const match = firstMatch({});

  assert.equal(match.applicationStatus, 'approved');
  assert.deepEqual(match.accountStatus, { $ne: 'suspended' });
});

test('a filter that is not a catalog identifier, or a district without its canton, is refused', () => {
  for (const query of [
    { activity: 'ferreterías' },
    { canton: { $ne: null } },
    { district: 'San Juan' },
    { canton: CANTON, district: 'x'.repeat(81) },
    { search: ['a', 'b'] },
  ]) {
    assert.throws(
      () => readDirectoryQuery(query),
      { name: 'ValidationError' },
      JSON.stringify(query),
    );
  }
});

test('a page holds twelve businesses unless asked otherwise', () => {
  assert.equal(readDirectoryQuery({}).pagination.pageSize, 12);
  assert.equal(readDirectoryQuery({ pageSize: '24' }).pagination.pageSize, 24);
});

test('a card code finds that card, and any other text searches the name as typed', () => {
  assert.deepEqual(firstMatch({ search: 'm-w85a-0q' }).memberCode, 'MW85A0Q');
  assert.equal(firstMatch({ search: 'Café (La)' }).businessName.$regex, 'Café \\(La\\)');
});

test('a member with no branches yet is placed by the canton on its registration', () => {
  const pipeline = listPipeline(readDirectoryQuery({ canton: CANTON, district: 'Tres Ríos' }));
  const place = pipeline.find((stage) => stage.$match?.$or !== undefined).$match.$or;

  assert.equal(String(place[0].branches.$elemMatch.canton), CANTON);
  assert.equal(place[0].branches.$elemMatch.district, 'Tres Ríos');
  assert.deepEqual(place[1].branches, { $size: 0 });
  assert.equal(String(place[1].canton), CANTON);
});

const MEMBER = {
  _id: 'm1',
  memberCode: 'MW85A0Q',
  businessName: 'Café Loma Verde',
  activity: 'Cafetería',
  branchModality: 'physical',
  branchName: 'Casa matriz',
  district: 'San Juan',
  branches: [
    { name: 'Sucursal San Juan', district: 'San Juan' },
    { name: 'Sucursal Tres Ríos', district: 'Tres Ríos' },
  ],
};

const proMembership = (expiresAt) => ({
  member: 'm1',
  plan: { key: 'pro', name: 'Pro Pymex' },
  expiresAt,
});

test('a listing names its first branch and how many more there are', () => {
  const listing = presentListing(MEMBER, undefined, NOW);

  assert.equal(listing.memberCode, 'M-W85A-0Q');
  assert.deepEqual(listing.branch, { name: 'Sucursal San Juan', district: 'San Juan' });
  assert.equal(listing.otherBranches, 1);
  assert.equal(listing.plan, null);
});

test('a paid plan shows while it holds and disappears the moment it runs out', () => {
  const running = presentListing(MEMBER, proMembership(new Date('2026-11-18T06:00:00Z')), NOW);
  const expired = presentListing(MEMBER, proMembership(new Date('2026-10-20T06:00:00Z')), NOW);

  assert.deepEqual(running.plan, { key: 'pro', name: 'Pro Pymex' });
  assert.equal(expired.plan, null);
});

test('a business with no door and no branches is listed as online', () => {
  const listing = presentListing(
    { ...MEMBER, branchModality: 'virtual', branches: [] },
    undefined,
    NOW,
  );

  assert.equal(listing.online, true);
  assert.equal(listing.branch, null);
});

test('the directory answers a page in the shape every list uses', async () => {
  const store = {
    aggregate: async () => [{ items: [MEMBER], total: [{ count: 13 }] }],
    findMemberships: async () => [],
  };

  const page = await listDirectory({ page: '2' }, NOW, store);

  assert.equal(page.total, 13);
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 2);
  assert.equal(page.items[0].businessName, 'Café Loma Verde');
});

test('a district written twice with different accents is offered once, in Spanish order', async () => {
  const store = {
    findListedMemberIds: async () => ['m1'],
    branchDistricts: async () => ['Tres Ríos', 'Concepción'],
    memberDistricts: async () => ['tres rios', ' San Juan '],
  };

  const { districts } = await listDistricts({ canton: CANTON }, store);

  assert.deepEqual(districts, ['Concepción', 'San Juan', 'Tres Ríos']);
});

test('districts are only listed for a canton', async () => {
  await assert.rejects(() => listDistricts({}), { name: 'ValidationError' });
});

test('the home page puts Premium first, then Pro, then Lite, and leaves out lapsed and free plans', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const future = new Date('2026-12-01T06:00:00Z');
  const past = new Date('2026-10-01T06:00:00Z');
  const membership = (member, key, expiresAt, startedAt) => ({
    member,
    plan: { key, name: key },
    expiresAt,
    startedAt: new Date(startedAt),
  });

  const ordered = featuredOrder(
    [
      membership('lite-member', 'lite', future, '2026-10-20'),
      membership('free-member', 'free', null, '2026-10-20'),
      membership('lapsed-premium', 'premium', past, '2026-09-01'),
      membership('older-pro', 'pro', future, '2026-09-01'),
      membership('premium-member', 'premium', future, '2026-09-15'),
      membership('newer-pro', 'pro', future, '2026-10-10'),
    ],
    now,
  );

  assert.deepEqual(
    ordered.map((entry) => entry.member),
    ['premium-member', 'newer-pro', 'older-pro', 'lite-member'],
  );
});
