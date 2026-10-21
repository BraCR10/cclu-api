const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listOwnVacancies,
  createVacancy,
  deleteOwnVacancy,
} = require('../../src/services/vacancyService');

const MEMBER_ID = '6aaf7c6235d3cb4fef09317b';
const OWN_BRANCH = '6aaf7c6235d3cb4fef0931aa';
const NOW = new Date('2026-10-20T12:00:00Z');

const PRO = { key: 'pro', entitlements: { publishJobs: true } };
const FREE = { key: 'free', entitlements: { publishJobs: false } };

function memoryStore({ plan = PRO, branches = [OWN_BRANCH], removed = 1 } = {}) {
  const created = [];

  return {
    created,
    readPlan: async () => plan,
    findBranch: async (memberId, branchId) =>
      memberId === MEMBER_ID && branches.includes(branchId) ? { _id: branchId } : null,
    list: async () => [],
    count: async () => 0,
    create: async (fields) => {
      const vacancy = { _id: 'v1', status: 'active', ...fields };
      created.push(vacancy);
      return vacancy;
    },
    find: async () => null,
    remove: async () => ({ matchedCount: removed }),
  };
}

const VALID = {
  title: 'Barista medio tiempo',
  description: 'Preparás bebidas de café y atendés a los clientes.',
  workday: 'part_time',
  howToApply: 'Enviá tu currículo por WhatsApp al 8845 1290.',
  branch: OWN_BRANCH,
};

test('a vacancy is published at one of the member’s own branches', async () => {
  const store = memoryStore();

  const vacancy = await createVacancy(MEMBER_ID, VALID, NOW, store);

  assert.equal(vacancy.title, 'Barista medio tiempo');
  assert.equal(vacancy.status, 'active');
  assert.equal(store.created[0].member, MEMBER_ID);
  assert.equal(store.created[0].publishedAt, NOW);
});

test('a vacancy cannot be placed at another business’s branch', async () => {
  const store = memoryStore();

  await assert.rejects(
    () => createVacancy(MEMBER_ID, { ...VALID, branch: '6aaf7c6235d3cb4fef0931ff' }, NOW, store),
    { field: 'branch' },
  );
  await assert.rejects(() =>
    createVacancy(MEMBER_ID, { ...VALID, branch: { $ne: null } }, NOW, store),
  );
  assert.equal(store.created.length, 0);
});

test('a vacancy that misses a field or overflows one is refused on that field', async () => {
  for (const [body, field] of [
    [{ ...VALID, title: '' }, 'title'],
    [{ ...VALID, title: 'x'.repeat(81) }, 'title'],
    [{ ...VALID, workday: 'whenever' }, 'workday'],
    [{ ...VALID, howToApply: undefined }, 'howToApply'],
  ]) {
    await assert.rejects(() => createVacancy(MEMBER_ID, body, NOW, memoryStore()), { field });
  }
});

test('the list says whether the member’s plan lets them publish now', async () => {
  assert.equal((await listOwnVacancies(MEMBER_ID, {}, NOW, memoryStore())).canPublish, true);
  assert.equal(
    (await listOwnVacancies(MEMBER_ID, {}, NOW, memoryStore({ plan: FREE }))).canPublish,
    false,
  );
});

test('deleting a vacancy that is not the member’s answers as if it did not exist', async () => {
  await assert.rejects(
    () => deleteOwnVacancy(MEMBER_ID, '6aaf7c6235d3cb4fef0931ee', NOW, memoryStore({ removed: 0 })),
    { statusCode: 404 },
  );
  await assert.rejects(() => deleteOwnVacancy(MEMBER_ID, 'nope', NOW, memoryStore()), {
    statusCode: 404,
  });
});
