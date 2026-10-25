const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listMembers,
  exportMembers,
  readMember,
  updateMember,
  setMemberStatus,
} = require('../../src/services/adminMemberService');
const { ValidationError } = require('../../src/config/memberRules');

const ID = '65f0c3a1b2c3d4e5f6a7b8c9';

function row(overrides = {}) {
  return {
    _id: ID,
    businessName: 'Café La Unión',
    name: null,
    email: 'ana@cafelaunion.cr',
    phone: '8888 8888',
    memberType: 'business',
    memberCode: 'M7K2QX4',
    accountStatus: 'active',
    canton: { name: 'La Unión', province: 'Cartago' },
    district: 'Tres Ríos',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  };
}

function storeOf({ members = [row()], membership = null, writes = [] } = {}) {
  const safeMembership = membership ?? {
    member: ID,
    status: 'active',
    startedAt: new Date('2026-01-15T10:00:00.000Z'),
    expiresAt: null,
    frequency: null,
    plan: { key: 'free', name: 'Gratuita' },
  };

  return {
    writes,
    list: async (filter) => {
      writes.push({ listed: filter });

      return members;
    },
    count: async () => members.length,
    all: async () => members,
    memberships: async () => [safeMembership],
    findPlanByKey: async (key) => (key === 'pro' ? { _id: 'plan-pro' } : null),
    memberIdsOnPlan: async () => [ID],
    findById: async (id) => (id === ID ? row() : null),
    membershipOf: async () => safeMembership,
    paymentsOf: async () => [
      {
        _id: 'p1',
        planName: 'Pro',
        amount: 25000,
        status: 'approved',
        submittedAt: new Date('2026-02-01T10:00:00.000Z'),
        decidedAt: new Date('2026-02-02T10:00:00.000Z'),
      },
    ],
    publicationsOf: async () => [
      {
        _id: 'pub1',
        title: 'Café de altura',
        type: 'product',
        status: 'active',
        publishedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ],
    update: async (id, fields) => {
      writes.push({ updated: fields });

      return row(fields);
    },
    writeAudit: async (entry) => {
      writes.push({ audit: entry });

      return entry;
    },
    actorName: async () => ({ name: 'Mariana Solís', email: 'mariana@camaralaunion.cr' }),
  };
}

test('the list names each member with the plan they hold, not only their data', async () => {
  const answer = await listMembers({}, storeOf());

  assert.equal(answer.items.length, 1);
  assert.equal(answer.items[0].businessName, 'Café La Unión');
  assert.equal(answer.items[0].canton, 'La Unión');
  assert.deepEqual(answer.items[0].plan, {
    key: 'free',
    name: 'Gratuita',
    expiresAt: null,
  });
});

// Only decided applications have a record here; a pending one belongs to the
// applications screen.
test('an undecided application is never part of the directory', async () => {
  const store = storeOf();

  await listMembers({ accountStatus: 'active' }, store);

  assert.equal(store.writes[0].listed.applicationStatus, 'approved');
});

test('a search reaches the code printed on the card as well as the name', async () => {
  const store = storeOf();

  await listMembers({ search: 'M7K2' }, store);

  const fields = store.writes[0].listed.$or.map((clause) => Object.keys(clause)[0]);

  assert.deepEqual(fields, ['businessName', 'name', 'email', 'identificationNumber', 'memberCode']);
});

test('a state that does not exist is refused rather than answered empty', async () => {
  await assert.rejects(listMembers({ accountStatus: 'borrado' }, storeOf()), ValidationError);
});

test('filtering by plan first resolves the key to the memberships that hold it', async () => {
  const store = storeOf();

  await listMembers({ plan: 'pro' }, store);

  assert.deepEqual(store.writes[0].listed._id, { $in: [ID] });
});

test('a plan key nobody has is refused', async () => {
  await assert.rejects(listMembers({ plan: 'platino' }, storeOf()), ValidationError);
});

test('the export carries every match, not the page on screen', async () => {
  const csv = await exportMembers({}, storeOf());

  assert.match(csv, /Código,Negocio/);
  assert.match(csv, /M7K2QX4,Café La Unión/);
});

test('one member answers with their plan, their payments and what they published', async () => {
  const answer = await readMember(ID, storeOf());

  assert.equal(answer.businessName, 'Café La Unión');
  assert.deepEqual(answer.plan, { key: 'free', name: 'Gratuita', expiresAt: null });
  assert.equal(answer.membership.frequency, null);
  assert.equal(answer.payments[0].planName, 'Pro');
  assert.equal(answer.publications[0].title, 'Café de altura');
  assert.equal('passwordHash' in answer, false);
});

test('a member that does not exist answers 404 rather than an empty body', async () => {
  await assert.rejects(readMember('65f0c3a1b2c3d4e5f6a7b8ff', storeOf()), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

// The address, the document and the trade are what the application was decided
// on; correcting them silently would rewrite that decision.
test('only the contact fields are read from the body, whatever else it carries', async () => {
  const store = storeOf();

  await updateMember(
    ID,
    {
      phone: '7777 7777',
      email: 'otra@example.cr',
      memberCode: 'XXXX',
      accountStatus: 'suspended',
    },
    store,
  );

  assert.deepEqual(store.writes[0].updated, { phone: '7777 7777' });
});

test('a request that changes nothing is refused', async () => {
  await assert.rejects(updateMember(ID, { other: 'x' }, storeOf()), (error) => {
    assert.equal(error.code, 'nothing_to_change');
    return true;
  });
});

// Suspending keeps the record and the reason, so the person asking why has an
// answer at the counter.
test('suspending writes the state, the reason and one audit entry', async () => {
  const store = storeOf();

  const answer = await setMemberStatus(
    { id: 'admin-1', role: 'admin' },
    ID,
    { status: 'suspended', reason: 'Dejó de pagar dos cuotas seguidas.' },
    store,
    new Date('2026-04-01T09:00:00.000Z'),
  );

  assert.deepEqual(store.writes[0].updated, {
    accountStatus: 'suspended',
    statusReason: 'Dejó de pagar dos cuotas seguidas.',
  });
  assert.equal(store.writes[1].audit.action, 'member.suspended');
  assert.equal(store.writes[1].audit.actor.name, 'Mariana Solís');
  assert.equal(answer.id, ID);
});

test('reactivating is the same write with the other state', async () => {
  const store = storeOf({ members: [row({ accountStatus: 'suspended' })] });

  store.findById = async () => row({ accountStatus: 'suspended' });

  await setMemberStatus(
    { id: 'admin-1', role: 'admin' },
    ID,
    { status: 'active', reason: 'Puso al día las cuotas pendientes.' },
    store,
  );

  assert.equal(store.writes[1].audit.action, 'member.reactivated');
});

test('a suspension without a real reason is refused', async () => {
  await assert.rejects(
    setMemberStatus(
      { id: 'a', role: 'admin' },
      ID,
      { status: 'suspended', reason: 'no' },
      storeOf(),
    ),
    (error) => {
      assert.equal(error.field, 'reason');
      return true;
    },
  );
});
