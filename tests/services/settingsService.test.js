const test = require('node:test');
const assert = require('node:assert/strict');
const { readNoticeDays, changeNoticeDays } = require('../../src/services/settingsService');

const ADMIN = { id: '64b7f0a1c2d3e4f5a6b7c8d9', role: 'admin' };

function store(stored, applied = []) {
  return {
    findSettings: async () => (stored === null ? null : { expiryNoticeDays: stored }),
    findAdmin: async () => ({ _id: ADMIN.id, name: 'Laura' }),
    applyChange: async (previous, next, actor) => applied.push({ previous, next, actor }),
  };
}

test('settings never seeded read as seven days', async () => {
  assert.equal(await readNoticeDays(store(null)), 7);
});

test('the notice is whole days from 1 to 27, and nothing else is written', async () => {
  for (const value of [0, 28, 31, 7.5, '10', -1, null, undefined, Number.MAX_SAFE_INTEGER]) {
    const applied = [];

    await assert.rejects(
      changeNoticeDays(ADMIN, { expiryNoticeDays: value }, store(7, applied)),
      { name: 'ValidationError' },
      String(value),
    );
    assert.equal(applied.length, 0);
  }
});

test('the same value is not a change', async () => {
  await assert.rejects(changeNoticeDays(ADMIN, { expiryNoticeDays: 7 }, store(7)), {
    code: 'nothing_to_change',
  });
});

test('a change is written against the value seen, with who made it', async () => {
  const applied = [];

  const answer = await changeNoticeDays(ADMIN, { expiryNoticeDays: 10 }, store(7, applied));

  assert.equal(answer.expiryNoticeDays, 10);
  assert.deepEqual(applied, [
    { previous: 7, next: 10, actor: { id: ADMIN.id, role: 'admin', name: 'Laura' } },
  ]);
});
