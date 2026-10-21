const test = require('node:test');
const assert = require('node:assert/strict');
const storeService = require('../../src/services/storeService');

const MEMBER_ID = '64b7f0a1c2d3e4f5a6b7c8d9';
const CATEGORY_ID = '64b7f0a1c2d3e4f5a6b7c8db';

function member(overrides = {}) {
  return {
    businessDescription: 'Café de altura de la zona.',
    storeCategories: [],
    instagram: '@cafelomaverde',
    facebook: null,
    linkedin: null,
    website: null,
    storeSchedule: [],
    ...overrides,
  };
}

function makeStore(row = member()) {
  const store = {
    row,
    find: async () => row,
    update: async (memberId, update) => {
      Object.assign(row, update.$set ?? {});

      for (const field of Object.keys(update.$unset ?? {})) {
        row[field] = null;
      }

      // The API reads the member back with its categories populated, so the
      // stand-in answers with the names rather than the references it stored.
      if (Array.isArray(row.storeCategories) && row.storeCategories.length > 0) {
        row.storeCategories = await store.findCategories(row.storeCategories);
      }

      return row;
    },
    findCategories: async (ids) => ids.map((id) => ({ _id: id, name: 'Cafeterías' })),
  };

  return store;
}

test('a shop that never set its hours reads as closed every day', async () => {
  const store = makeStore();

  const shop = await storeService.readOwnStore(MEMBER_ID, store);

  assert.equal(shop.schedule.length, 7);
  assert.equal(shop.schedule[0].day, 'monday');
  assert.equal(
    shop.schedule.every((day) => day.closed === true),
    true,
  );
  assert.equal(shop.businessDescription, 'Café de altura de la zona.');
});

test('the week is saved as sent and the days left out are closed', async () => {
  const store = makeStore();

  const shop = await storeService.updateOwnStore(
    MEMBER_ID,
    {
      schedule: [
        { day: 'monday', closed: false, opensAt: '07:00', closesAt: '18:00' },
        { day: 'sunday', closed: true },
      ],
    },
    store,
  );

  assert.deepEqual(shop.schedule[0], {
    day: 'monday',
    closed: false,
    opensAt: '07:00',
    closesAt: '18:00',
  });
  assert.equal(shop.schedule[1].closed, true);
  assert.deepEqual(shop.schedule[6], { day: 'sunday', closed: true });
});

test('a day that closes before it opens is refused', async () => {
  const store = makeStore();

  await assert.rejects(
    storeService.updateOwnStore(
      MEMBER_ID,
      { schedule: [{ day: 'monday', closed: false, opensAt: '18:00', closesAt: '07:00' }] },
      store,
    ),
    (error) => error.code === 'invalid_format' && error.field === 'schedule',
  );
});

test('an hour that is not a time of day is refused', async () => {
  const store = makeStore();

  await assert.rejects(
    storeService.updateOwnStore(
      MEMBER_ID,
      { schedule: [{ day: 'monday', closed: false, opensAt: '7am', closesAt: '18:00' }] },
      store,
    ),
    (error) => error.code === 'invalid_format',
  );
});

test('a day named twice is refused', async () => {
  const store = makeStore();

  await assert.rejects(
    storeService.updateOwnStore(
      MEMBER_ID,
      {
        schedule: [
          { day: 'monday', closed: true },
          { day: 'monday', closed: true },
        ],
      },
      store,
    ),
    (error) => error.code === 'not_allowed',
  );
});

test('the shop keeps the categories the catalog knows', async () => {
  const store = makeStore();
  store.findCategories = async (ids) =>
    ids.includes(CATEGORY_ID) ? [{ _id: CATEGORY_ID, name: 'Cafeterías' }] : [];

  const shop = await storeService.updateOwnStore(MEMBER_ID, { categories: [CATEGORY_ID] }, store);

  assert.equal(shop.categories.length, 1);
});

test('a category that does not exist is refused', async () => {
  const store = makeStore();
  store.findCategories = async () => [];

  await assert.rejects(
    storeService.updateOwnStore(MEMBER_ID, { categories: [CATEGORY_ID] }, store),
    (error) => error.code === 'unknown_reference' && error.field === 'categories',
  );
});

test('a social account sent empty is taken off the shop', async () => {
  const store = makeStore();

  const shop = await storeService.updateOwnStore(MEMBER_ID, { instagram: '' }, store);

  assert.equal(shop.instagram, null);
  assert.equal(shop.businessDescription, 'Café de altura de la zona.');
});

test('an edit that changes nothing is refused', async () => {
  const store = makeStore();

  await assert.rejects(
    storeService.updateOwnStore(MEMBER_ID, {}, store),
    (error) => error.code === 'nothing_to_change',
  );
});
