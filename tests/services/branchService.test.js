const test = require('node:test');
const assert = require('node:assert/strict');
const branchService = require('../../src/services/branchService');

const MEMBER_ID = '64b7f0a1c2d3e4f5a6b7c8d9';
const BRANCH_ID = '64b7f0a1c2d3e4f5a6b7c8da';
const CANTON_ID = '64b7f0a1c2d3e4f5a6b7c8db';
const ACTIVITY_ID = '64b7f0a1c2d3e4f5a6b7c8dc';

const CANTON = { _id: CANTON_ID, name: 'La Unión', province: 'Cartago' };

const MEMBER = {
  _id: MEMBER_ID,
  branchName: 'Local principal',
  canton: CANTON_ID,
  district: 'Tres Ríos',
  location: 'Frente a la plaza',
  institutionalPhone: '22791234',
  activity: ACTIVITY_ID,
};

function branch(overrides = {}) {
  return {
    _id: BRANCH_ID,
    name: 'Local principal',
    isPrimary: true,
    canton: CANTON,
    district: 'Tres Ríos',
    address: 'Frente a la plaza',
    phone: null,
    schedule: null,
    municipalPermit: null,
    activity: null,
    removedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// The member's branches in memory, so every test states the case it is about
// rather than a query.
function makeStore(branches = []) {
  const rows = branches.slice();

  return {
    rows,
    findMember: async () => MEMBER,
    countActive: async () => rows.filter((row) => row.removedAt === null).length,
    list: async () => rows.filter((row) => row.removedAt === null),
    find: async (memberId, branchId) =>
      rows.find((row) => row._id === branchId && row.removedAt === null) ?? null,
    create: async (fields) => {
      const created = branch({
        ...fields,
        _id: `created-${rows.length}`,
        canton: CANTON,
        phone: fields.phone ?? null,
      });

      rows.push(created);

      return created;
    },
    update: async (branchId, update) => {
      const row = rows.find((candidate) => candidate._id === branchId);

      Object.assign(row, update.$set ?? {});

      for (const field of Object.keys(update.$unset ?? {})) {
        row[field] = null;
      }

      return row;
    },
    remove: async (branchId) => {
      const row = rows.find((candidate) => candidate._id === branchId);

      row.removedAt = new Date();
    },
    clearPrimary: async () => {
      for (const row of rows) {
        row.isPrimary = false;
      }
    },
    promoteFirst: async () => {
      const next = rows.find((row) => row.removedAt === null);

      if (next !== undefined) {
        next.isPrimary = true;
      }
    },
  };
}

test('the approved registration becomes the first branch', async () => {
  const store = makeStore();

  const { items } = await branchService.readOwnBranches(MEMBER_ID, store);

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Local principal');
  assert.equal(items[0].address, 'Frente a la plaza');
  assert.equal(items[0].canton.name, 'La Unión');
  assert.equal(items[0].isPrimary, true);
});

test('a business without a door is left without branches to add its own', async () => {
  const store = makeStore();

  store.findMember = async () => ({ ...MEMBER, location: undefined, branchName: undefined });

  const { items } = await branchService.readOwnBranches(MEMBER_ID, store);

  assert.deepEqual(items, []);
  assert.equal(store.rows.length, 0);
});

test('a second branch can be added without taking the first one primary', async () => {
  const store = makeStore([branch()]);

  const created = await branchService.createBranch(
    MEMBER_ID,
    {
      name: 'Sucursal Curridabat',
      canton: CANTON_ID,
      district: 'Granadilla',
      address: '100 m sur del parque',
    },
    store,
  );

  assert.equal(created.name, 'Sucursal Curridabat');
  assert.equal(created.isPrimary, false);
  assert.equal(store.rows.filter((row) => row.isPrimary).length, 1);
});

test('the first branch is primary whatever the body says', async () => {
  const store = makeStore();

  const created = await branchService.createBranch(
    MEMBER_ID,
    {
      name: 'Sucursal Curridabat',
      canton: CANTON_ID,
      district: 'Granadilla',
      address: '100 m sur del parque',
      isPrimary: false,
    },
    store,
  );

  assert.equal(created.isPrimary, true);
});

test('naming a branch primary takes it from the one that had it', async () => {
  const store = makeStore([branch(), branch({ _id: 'second', isPrimary: false })]);

  await branchService.updateBranch(MEMBER_ID, 'second', { isPrimary: true }, store);

  assert.deepEqual(
    store.rows.map((row) => row.isPrimary),
    [false, true],
  );
});

test('a branch is edited field by field and an empty one is taken off', async () => {
  const store = makeStore([branch({ phone: '2272 1180', schedule: 'Lunes a sábado' })]);

  const updated = await branchService.updateBranch(
    MEMBER_ID,
    BRANCH_ID,
    { phone: '', district: 'San Ramón' },
    store,
  );

  assert.equal(updated.district, 'San Ramón');
  assert.equal(updated.phone, null);
  assert.equal(updated.schedule, 'Lunes a sábado');
});

test('an edit that changes nothing is refused', async () => {
  const store = makeStore([branch()]);

  await assert.rejects(
    branchService.updateBranch(MEMBER_ID, BRANCH_ID, {}, store),
    (error) => error.code === 'nothing_to_change',
  );
});

test('a branch without a name or an address is refused, naming the field', async () => {
  const store = makeStore([branch()]);

  await assert.rejects(
    branchService.createBranch(MEMBER_ID, { canton: CANTON_ID, district: 'Granadilla' }, store),
    (error) => error.code === 'required' && error.field === 'name',
  );

  await assert.rejects(
    branchService.createBranch(
      MEMBER_ID,
      { name: 'Sucursal', canton: CANTON_ID, district: 'Granadilla' },
      store,
    ),
    (error) => error.code === 'required' && error.field === 'address',
  );
});

test('the last branch cannot be closed', async () => {
  const store = makeStore([branch()]);

  await assert.rejects(
    branchService.deleteBranch(MEMBER_ID, BRANCH_ID, store),
    (error) => error.code === 'last_branch' && error.statusCode === 409,
  );

  assert.equal(store.rows[0].removedAt, null);
});

test('a branch is closed by date rather than deleted', async () => {
  const store = makeStore([branch(), branch({ _id: 'second', isPrimary: false })]);

  const { items } = await branchService.deleteBranch(MEMBER_ID, 'second', store);

  assert.equal(items.length, 1);
  assert.notEqual(store.rows[1].removedAt, null);
});

test('closing the primary branch leaves another one in its place', async () => {
  const store = makeStore([branch(), branch({ _id: 'second', isPrimary: false })]);

  const { items } = await branchService.deleteBranch(MEMBER_ID, BRANCH_ID, store);

  assert.equal(items.length, 1);
  assert.equal(items[0].isPrimary, true);
});

test('a branch of somebody else is not found', async () => {
  const store = makeStore([branch()]);

  await assert.rejects(
    branchService.updateBranch(MEMBER_ID, 'another-member-branch', { district: 'Otro' }, store),
    (error) => error.statusCode === 404,
  );
});
