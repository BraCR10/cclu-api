const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readBoardQuery,
  listBoard,
  readBoardVacancy,
} = require('../../src/services/jobBoardService');

const NOW = new Date('2026-10-20T12:00:00Z');
const PUBLISHER = '6aaf7c6235d3cb4fef09317b';
const LAPSED = '6aaf7c6235d3cb4fef09317c';
const VACANCY_ID = '6aaf7c6235d3cb4fef0931aa';
const CANTON = '6aaf2cf895dc1da3c7333013';

const vacancyOf = (memberId) => ({
  _id: VACANCY_ID,
  title: 'Barista medio tiempo',
  description: 'Preparás bebidas de café.',
  howToApply: 'WhatsApp 8845 1290',
  workday: 'part_time',
  publishedAt: NOW,
  branch: { name: 'Sucursal San Juan', district: 'San Juan', canton: { name: 'La Unión' } },
  member: { _id: memberId, businessName: 'Café Loma Verde', memberCode: 'MW85A0Q' },
});

function memoryStore(vacancy = vacancyOf(PUBLISHER)) {
  const filters = [];

  return {
    filters,
    findPublishingMembers: async () => [PUBLISHER],
    findBranchesAt: async () => ['b1'],
    list: async (filter) => {
      filters.push(filter);
      return [vacancy];
    },
    count: async () => 1,
    find: async () => vacancy,
  };
}

test('the board only asks for active vacancies of members whose plan includes them now', async () => {
  const store = memoryStore();

  const page = await listBoard({}, NOW, store);

  assert.deepEqual(store.filters[0].member, { $in: [PUBLISHER] });
  assert.equal(store.filters[0].status, 'active');
  assert.equal(store.filters[0].removedAt, null);
  assert.equal(page.items[0].business.memberCode, 'M-W85A-0Q');
});

test('a vacancy whose business no longer has the plan is not found, like one that never was', async () => {
  await assert.rejects(() => readBoardVacancy(VACANCY_ID, NOW, memoryStore(vacancyOf(LAPSED))), {
    statusCode: 404,
  });
  await assert.rejects(() => readBoardVacancy('nope', NOW, memoryStore()), { statusCode: 404 });
});

test('a vacancy on the board shows how to apply and who posted it', async () => {
  const vacancy = await readBoardVacancy(VACANCY_ID, NOW, memoryStore());

  assert.equal(vacancy.howToApply, 'WhatsApp 8845 1290');
  assert.equal(vacancy.business.name, 'Café Loma Verde');
});

test('a place filters by the branches there, and a search is read as typed', async () => {
  const store = memoryStore();

  await listBoard({ canton: CANTON, district: 'San Juan', search: 'Barista (medio)' }, NOW, store);

  assert.deepEqual(store.filters[0].branch, { $in: ['b1'] });
  assert.equal(store.filters[0].title.$regex, 'Barista \\(medio\\)');
});

test('a district without its canton, or a workday that does not exist, is refused', () => {
  for (const query of [{ district: 'San Juan' }, { workday: 'nights' }, { canton: 'La Unión' }]) {
    assert.throws(() => readBoardQuery(query), { name: 'ValidationError' }, JSON.stringify(query));
  }
});
