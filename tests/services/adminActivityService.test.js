const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listActivities,
  createActivity,
  updateActivity,
  removeActivity,
} = require('../../src/services/adminActivityService');
const { ValidationError } = require('../../src/config/memberRules');

function row(id, name, status, extra = {}) {
  return { _id: id, name, status, ...extra };
}

function storeOf(rows, { usage = new Map(), counts } = {}) {
  const writes = [];

  return {
    writes,
    list: async () => rows,
    counts: async () =>
      counts ??
      rows.reduce(
        (totals, activity) => ({
          ...totals,
          [activity.status]: (totals[activity.status] ?? 0) + 1,
        }),
        {},
      ),
    usage: async () => usage,
    findById: async (id) => rows.find((activity) => activity._id === id) ?? null,
    findByName: async (name) =>
      rows.find((activity) => activity.name.toLowerCase() === name.toLowerCase()) ?? null,
    create: async (document) => {
      const created = row('new', document.name, document.status);

      writes.push(created);

      return created;
    },
    update: async (id, fields) => {
      writes.push({ id, fields });

      return { ...rows.find((activity) => activity._id === id), ...fields };
    },
    remove: async (id) => {
      writes.push({ removed: id });

      return rows.find((activity) => activity._id === id);
    },
    countMembers: async () => (usage.size === 0 ? 0 : 1),
  };
}

const ID = '65f0c3a1b2c3d4e5f6a7b8c9';

test('every entry arrives with the count of members who carry it', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active'), row('b2', 'Textiles', 'pending')], {
    usage: new Map([[ID, 12]]),
  });

  const answer = await listActivities({}, store);

  assert.deepEqual(answer.items, [
    { id: ID, name: 'Cafeterías', status: 'active', members: 12 },
    { id: 'b2', name: 'Textiles', status: 'pending', members: 0 },
  ]);
  assert.deepEqual(answer.counts, { active: 1, pending: 1, inactive: 0 });
});

test('search ignores case, and an accent still has to match the way the catalog spells it', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active'), row('b2', 'Textiles', 'active')]);

  assert.deepEqual(
    (await listActivities({ search: 'CAFETERÍAS' }, store)).items.map((activity) => activity.name),
    ['Cafeterías'],
  );
  assert.deepEqual((await listActivities({ search: 'cafeterias' }, store)).items, []);
});

test('a state narrows the list to it', async () => {
  const store = storeOf([
    row(ID, 'Cafeterías', 'active'),
    row('b2', 'Textiles', 'pending'),
    row('c3', 'Panaderías', 'inactive'),
  ]);

  const answer = await listActivities({ status: 'pending' }, store);

  assert.deepEqual(
    answer.items.map((activity) => activity.name),
    ['Textiles'],
  );
});

test('an unknown state is ignored rather than answered empty', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active')]);

  const answer = await listActivities({ status: 'inventado' }, store);

  assert.equal(answer.items.length, 1);
});

// The chamber typing an activity is the chamber accepting it.
test('a new entry is written active', async () => {
  const store = storeOf([]);

  const created = await createActivity({ name: 'Artesanías' }, store);

  assert.deepEqual(store.writes, [row('new', 'Artesanías', 'active')]);
  assert.equal(created.name, 'Artesanías');
});

test('a name the catalog already has is refused on its own field, ignoring case', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active')]);

  await assert.rejects(createActivity({ name: 'cafeterías' }, store), (error) => {
    assert.equal(error.field, 'name');
    assert.equal(error.code, 'already_registered');
    return true;
  });

  assert.deepEqual(store.writes, []);
});

test('a name of spaces is refused before anything is written', async () => {
  const store = storeOf([]);

  await assert.rejects(createActivity({ name: '   ' }, store), ValidationError);
  assert.deepEqual(store.writes, []);
});

test('renaming keeps the identifier, which is what members point at', async () => {
  const store = storeOf([row(ID, 'Cafeterias', 'active')]);

  const updated = await updateActivity(ID, { name: 'Cafeterías de especialidad' }, store);

  assert.deepEqual(store.writes, [{ id: ID, fields: { name: 'Cafeterías de especialidad' } }]);
  assert.equal(updated.name, 'Cafeterías de especialidad');
});

// Accepting a trade an applicant named is the same write as any other state
// change, which is why the pending tab needs no endpoint of its own.
test('accepting a pending activity is a status change', async () => {
  const store = storeOf([row(ID, 'Textiles', 'pending')]);

  const updated = await updateActivity(ID, { status: 'active' }, store);

  assert.deepEqual(store.writes, [{ id: ID, fields: { status: 'active' } }]);
  assert.equal(updated.status, 'active');
});

test('a request that changes nothing is refused rather than written', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active')]);

  await assert.rejects(
    updateActivity(ID, { name: 'Cafeterías', status: 'active' }, store),
    (error) => {
      assert.equal(error.code, 'nothing_to_change');
      return true;
    },
  );

  assert.deepEqual(store.writes, []);
});

test('an activity no longer in the catalog answers 404 rather than being written', async () => {
  const store = storeOf([]);

  await assert.rejects(updateActivity(ID, { status: 'active' }, store), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

// Deleting one a member carries would leave their record pointing at nothing.
test('an activity members are classified under is refused, with retire as the way out', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'active')], { usage: new Map([[ID, 12]]) });

  await assert.rejects(removeActivity(ID, store), (error) => {
    assert.equal(error.code, 'not_allowed');
    return true;
  });

  assert.deepEqual(store.writes, []);
});

test('an activity nobody uses leaves the collection', async () => {
  const store = storeOf([row(ID, 'Cafeterías', 'inactive')]);

  await removeActivity(ID, store);

  assert.deepEqual(store.writes, [{ removed: ID }]);
});

test('an identifier that is not one is refused before the collection is read', async () => {
  const store = storeOf([]);

  await assert.rejects(removeActivity('no-es-un-id', store), ValidationError);
});
