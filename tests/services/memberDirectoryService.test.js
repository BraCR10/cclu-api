const test = require('node:test');
const assert = require('node:assert/strict');
const { listPublicDirectory } = require('../../src/services/memberDirectoryService');
const { generateMemberCode, formatMemberCode } = require('../../src/services/memberCodeService');

const CANTON_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const SECTOR_ID = '65f0c3a1b2c3d4e5f6a7b8cb';
const CODE = generateMemberCode();

const affiliate = (overrides = {}) => ({
  memberCode: CODE,
  businessName: 'Panadería Tres Ríos',
  businessDescription: 'Panadería artesanal.',
  memberType: 'business',
  location: 'Frente al parque',
  phone: '22791234',
  createdAt: new Date('2026-03-04T12:00:00.000Z'),
  sector: { name: 'Alimentos y bebidas' },
  canton: { name: 'La Unión', province: 'Cartago' },
  email: 'socio@example.cr',
  identificationNumber: '3101456789',
  passwordHash: '$2b$12$notarealhash',
  applicationStatus: 'approved',
  accountStatus: 'active',
  ...overrides,
});

function recordingFinder(members) {
  const filters = [];

  return {
    filters,
    find: async (filter, skip, limit) => {
      filters.push({ filter, skip, limit });
      return members;
    },
  };
}

test('the base filter admits only an affiliate approved and active', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({}, find, async () => 0);

  assert.equal(filters[0].filter.applicationStatus, 'approved');
  assert.equal(filters[0].filter.accountStatus, 'active');
});

test('a name filter is read as a case insensitive match, not an exact one', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ name: 'panadería' }, find, async () => 0);

  assert.match('Panadería Tres Ríos', filters[0].filter.businessName);
  assert.equal(filters[0].filter.businessName.flags.includes('i'), true);
});

test('a name filter cannot be turned into a query operator', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ name: { $ne: null } }, find, async () => 0);

  assert.equal('businessName' in filters[0].filter, false);
});

test('canton and sector filter only when they look like a real reference', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ canton: CANTON_ID, sector: 'not-an-id' }, find, async () => 0);

  assert.equal(filters[0].filter.canton, CANTON_ID);
  assert.equal('sector' in filters[0].filter, false);
});

test('a valid sector reference is applied the same way canton is', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ sector: SECTOR_ID }, find, async () => 0);

  assert.equal(filters[0].filter.sector, SECTOR_ID);
});

test('pagination defaults to the first page and the default page size', async () => {
  const { filters, find } = recordingFinder([]);

  const answer = await listPublicDirectory({}, find, async () => 0);

  assert.equal(filters[0].skip, 0);
  assert.equal(filters[0].limit, 20);
  assert.equal(answer.page, 1);
  assert.equal(answer.limit, 20);
});

test('a page size beyond the maximum is capped rather than honoured', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ limit: 500 }, find, async () => 0);

  assert.equal(filters[0].limit, 50);
});

test('a page or limit that is not a real number falls back to the default', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ page: 'x', limit: '-5' }, find, async () => 0);

  assert.equal(filters[0].skip, 0);
  assert.equal(filters[0].limit, 20);
});

test('the second page skips exactly one page worth of results', async () => {
  const { filters, find } = recordingFinder([]);

  await listPublicDirectory({ page: 2, limit: 10 }, find, async () => 0);

  assert.equal(filters[0].skip, 10);
});

test('hasMore is true only while more remain beyond what was returned', async () => {
  const { find } = recordingFinder([affiliate(), affiliate()]);

  const full = await listPublicDirectory({ page: 1, limit: 2 }, find, async () => 5);
  const exhausted = await listPublicDirectory({ page: 1, limit: 2 }, find, async () => 2);

  assert.equal(full.hasMore, true);
  assert.equal(exhausted.hasMore, false);
});

test('each item is presented the same way a single public profile is', async () => {
  const { find } = recordingFinder([affiliate()]);

  const { items } = await listPublicDirectory({}, find, async () => 1);

  assert.deepEqual(items[0], {
    memberCode: formatMemberCode(CODE),
    businessName: 'Panadería Tres Ríos',
    businessDescription: 'Panadería artesanal.',
    memberType: 'business',
    sector: 'Alimentos y bebidas',
    canton: 'La Unión',
    province: 'Cartago',
    location: 'Frente al parque',
    phone: '22791234',
    whatsappNumber: null,
    instagram: null,
    facebook: null,
    linkedin: null,
    website: null,
    logoUrl: null,
    affiliatedSince: affiliate().createdAt,
  });
});

test('nothing administrative survives into a listing', async () => {
  const { find } = recordingFinder([affiliate()]);

  const { items } = await listPublicDirectory({}, find, async () => 1);
  const raw = JSON.stringify(items);

  for (const secret of ['socio@example.cr', '3101456789', '$2b$12$notarealhash', 'approved']) {
    assert.ok(!raw.includes(secret), `the listing carried ${secret}`);
  }
});

test('a listing carrying a logo key answers with a signed address', async () => {
  const { find } = recordingFinder([affiliate({ logoKey: 'member-logos/x/y.png' })]);
  const sign = async (key) => `https://storage.example/${key}?signed`;

  const { items } = await listPublicDirectory({}, find, async () => 1, sign);

  assert.equal(items[0].logoUrl, 'https://storage.example/member-logos/x/y.png?signed');
});
