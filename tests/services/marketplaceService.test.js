const test = require('node:test');
const assert = require('node:assert/strict');
const marketplaceService = require('../../src/services/marketplaceService');

const NOW = new Date('2026-10-23T15:00:00Z');
const PUBLICATION_ID = '64b7f0a1c2d3e4f5a6b7c8da';

function stored(overrides = {}) {
  return {
    _id: PUBLICATION_ID,
    type: 'product',
    title: 'Café molido 500 g',
    description: 'Tueste medio.',
    price: 5500,
    imageUrl: 'https://cdn.example.cr/cafe.png',
    category: { _id: '64b7f0a1c2d3e4f5a6b7c8db', name: 'Cafeterías' },
    percentage: null,
    condition: null,
    startsAt: null,
    endsAt: null,
    status: 'active',
    publishedAt: NOW,
    member: {
      businessName: 'Café Loma Verde',
      memberCode: 'M-A7K2-Q4',
      district: 'Tres Ríos',
      logoUrl: null,
      canton: { name: 'La Unión' },
    },
    ...overrides,
  };
}

let lastFilter = null;

function makeStore(rows = [stored()]) {
  return {
    shopWindows: async () => ['64b7f0a1c2d3e4f5a6b7c8d9'],
    list: async (filter) => {
      lastFilter = filter;

      return rows;
    },
    count: async () => rows.length,
    find: async (filter) => {
      lastFilter = filter;

      return rows[0] ?? null;
    },
  };
}

test('the marketplace answers with what is on offer and who sells it', async () => {
  const answer = await marketplaceService.readMarketplace({}, NOW, makeStore());

  assert.equal(answer.items.length, 1);
  assert.equal(answer.items[0].title, 'Café molido 500 g');
  assert.equal(answer.items[0].business.businessName, 'Café Loma Verde');
  assert.equal(answer.items[0].business.canton, 'La Unión');
  assert.equal(answer.total, 1);
});

// A lapsed plan stops being a shop window without anyone deleting anything, so
// the query only ever looks at publications of members that hold the plan.
test('only publications of businesses that hold the plan are looked at', async () => {
  const store = makeStore();

  await marketplaceService.readMarketplace({}, NOW, store);

  assert.deepEqual(lastFilter.member, { $in: ['64b7f0a1c2d3e4f5a6b7c8d9'] });
  assert.equal(lastFilter.status, 'active');
  assert.equal(lastFilter.removedAt, null);
});

test('a publication outside its validity is not offered', async () => {
  const store = makeStore();

  await marketplaceService.readMarketplace({}, NOW, store);

  // Two ranges, each open at one end: nothing yet to start, nothing already over.
  assert.equal(lastFilter.$and.length, 2);
});

test('a kind of publication that does not exist is refused on the field', async () => {
  await assert.rejects(
    marketplaceService.readMarketplace({ type: 'lottery' }, NOW, makeStore()),
    (error) => error.code === 'not_allowed' && error.field === 'type',
  );
});

test('the search is read as text, never as a pattern', async () => {
  const store = makeStore();

  await marketplaceService.readMarketplace({ search: 'café (.*)' }, NOW, store);

  assert.deepEqual(lastFilter.$or, [
    { title: { $regex: 'café \\(\\.\\*\\)', $options: 'i' } },
    { description: { $regex: 'café \\(\\.\\*\\)', $options: 'i' } },
  ]);
});

test('a publication that is no longer offered is not found', async () => {
  const store = makeStore([]);

  await assert.rejects(
    marketplaceService.readMarketplaceItem(PUBLICATION_ID, NOW, store),
    (error) => error.statusCode === 404,
  );
});

test('one publication is read with the same rules as the list', async () => {
  const store = makeStore();

  const found = await marketplaceService.readMarketplaceItem(PUBLICATION_ID, NOW, store);

  assert.equal(found.id, PUBLICATION_ID);
  assert.equal(lastFilter._id, PUBLICATION_ID);
});

// The panel's figure is the size of what a visitor can find, asked the same way,
// so a lapse that empties a shop window empties the figure too.
test('the panel counts exactly what the marketplace shows', async () => {
  let counted = null;
  const store = {
    shopWindows: async () => ['64b7f0a1c2d3e4f5a6b7c8d9'],
    count: async (filter) => {
      counted = filter;

      return 12;
    },
  };

  assert.equal(await marketplaceService.countVisible(NOW, store), 12);
  assert.equal(counted.status, 'active');
  assert.equal(counted.removedAt, null);
  assert.deepEqual(counted.member, { $in: ['64b7f0a1c2d3e4f5a6b7c8d9'] });
});
