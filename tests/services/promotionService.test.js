const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listPromotions,
  getPromotionById,
  listOwnPromotions,
  createPromotion,
  updatePromotion,
  closePromotion,
} = require('../../src/services/promotionService');
const { listDiscounts, createDiscount } = require('../../src/services/discountService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ANOTHER_MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const PROMOTION_ID = '65f0c3a1b2c3d4e5f6a7b8cb';

const NOW = new Date('2026-09-21T12:00:00.000Z');
const now = () => NOW;
const TOMORROW = new Date('2026-09-22T00:00:00.000Z');
const YESTERDAY = new Date('2026-09-20T00:00:00.000Z');

function paidOwner(overrides = {}) {
  return {
    _id: MEMBER_ID,
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    phone: '22791234',
    location: 'Frente al parque',
    applicationStatus: 'approved',
    accountStatus: 'active',
    paidUntil: new Date('2026-10-21T00:00:00.000Z'),
    canton: { name: 'La Unión' },
    sector: { name: 'Comercio' },
    ...overrides,
  };
}

function promotion(overrides = {}) {
  return {
    _id: PROMOTION_ID,
    member: MEMBER_ID,
    title: '2x1 en pan dulce',
    description: 'Todos los martes.',
    conditions: 'Solo en tienda.',
    validUntil: TOMORROW,
    isActive: true,
    adminStatus: 'active',
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  };
}

const owners = (ids) => async () => ids;

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a promotion needs every one of its fields to be born', async () => {
  for (const missing of ['title', 'description', 'conditions']) {
    const body = {
      title: 'x',
      description: 'y',
      conditions: 'z',
      validUntil: TOMORROW.toISOString(),
    };
    delete body[missing];

    const error = await refusal(() => createPromotion(MEMBER_ID, body));

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, missing);
  }
});

test('a promotion born already expired is refused', async () => {
  const error = await refusal(() =>
    createPromotion(
      MEMBER_ID,
      { title: 'x', description: 'y', conditions: 'z', validUntil: YESTERDAY.toISOString() },
      undefined,
      now,
    ),
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, 'validUntil');
});

test('a valid promotion is created for the signed in member alone', async () => {
  const saved = [];
  const persist = async (fields) => {
    saved.push(fields);
    return promotion(fields);
  };

  const created = await createPromotion(
    MEMBER_ID,
    {
      title: ' 2x1 en pan dulce ',
      description: 'Todos los martes.',
      conditions: 'Solo en tienda.',
      validUntil: TOMORROW.toISOString(),
    },
    persist,
    now,
  );

  assert.equal(saved[0].member, MEMBER_ID);
  assert.equal(created.title, '2x1 en pan dulce');
  assert.equal(created.expired, false);
});

test('the public listing asks only for live promotions of paid owners', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [promotion({ member: paidOwner() })];
  };

  const answer = await listPromotions({}, owners([MEMBER_ID]), find, async () => 1, now);

  assert.deepEqual(filters[0].member, { $in: [MEMBER_ID] });
  assert.equal(filters[0].isActive, true);
  assert.equal(filters[0].adminStatus, 'active');
  assert.ok(filters[0].validUntil.$gte instanceof Date);
  assert.equal(answer.items[0].title, '2x1 en pan dulce');
  assert.equal(answer.items[0].business.businessName, 'Panadería Tres Ríos');
});

test('a name filter is read as a case insensitive match over the title', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [];
  };

  await listPromotions({ name: '2X1' }, owners([]), find, async () => 0, now);

  assert.match('2x1 en pan dulce', filters[0].title);
});

test('an expired, closed, moderated or unpaid promotion is not listed one by one either', async () => {
  for (const fixture of [
    null,
    promotion({ isActive: false, member: paidOwner() }),
    promotion({ adminStatus: 'inactive', member: paidOwner() }),
    promotion({ validUntil: YESTERDAY, member: paidOwner() }),
    promotion({ member: paidOwner({ paidUntil: YESTERDAY }) }),
  ]) {
    const error = await refusal(() => getPromotionById(PROMOTION_ID, async () => fixture, now));

    assert.equal(error.statusCode, 404);
  }
});

test('a member sees their own promotions with expiry and moderation visible', async () => {
  const own = await listOwnPromotions(
    MEMBER_ID,
    async () => [
      promotion(),
      promotion({ _id: 'x', validUntil: YESTERDAY, adminStatus: 'blocked' }),
    ],
    now,
  );

  assert.equal(own[0].expired, false);
  assert.equal(own[1].expired, true);
  assert.equal(own[1].adminStatus, 'blocked');
});

test('reactivating an expired promotion without a new validity is refused', async () => {
  const error = await refusal(() =>
    updatePromotion(
      PROMOTION_ID,
      MEMBER_ID,
      { isActive: true },
      async () => promotion({ isActive: false, validUntil: YESTERDAY }),
      undefined,
      now,
    ),
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, 'expired_needs_new_validity');
});

test('reactivating with a fresh validity goes through', async () => {
  const applied = [];
  const apply = async (id, changes) => {
    applied.push(changes);
    return promotion({ ...changes });
  };

  const updated = await updatePromotion(
    PROMOTION_ID,
    MEMBER_ID,
    { isActive: true, validUntil: TOMORROW.toISOString() },
    async () => promotion({ isActive: false, validUntil: YESTERDAY }),
    apply,
    now,
  );

  assert.equal(updated.isActive, true);
  assert.equal(applied[0].isActive, true);
});

test('a blocked promotion cannot be touched again, not even by its owner', async () => {
  const error = await refusal(() =>
    updatePromotion(PROMOTION_ID, MEMBER_ID, { title: 'x' }, async () =>
      promotion({ adminStatus: 'blocked' }),
    ),
  );

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'blocked_publication');
});

test('a member cannot edit a promotion that belongs to someone else', async () => {
  const error = await refusal(() =>
    updatePromotion(PROMOTION_ID, ANOTHER_MEMBER_ID, { title: 'x' }, async () => promotion()),
  );

  assert.equal(error.statusCode, 403);
});

test('closing a promotion turns it off instead of removing the record', async () => {
  const applied = [];

  await closePromotion(
    PROMOTION_ID,
    MEMBER_ID,
    async () => promotion(),
    async (id) => applied.push(id),
  );

  assert.deepEqual(applied, [PROMOTION_ID]);
});

test('nothing administrative about the owner survives into a public answer', async () => {
  const find = async () => [
    promotion({ member: paidOwner({ passwordHash: '$2b$12$notarealhash' }) }),
  ];

  const answer = await listPromotions({}, owners([MEMBER_ID]), find, async () => 1, now);
  const raw = JSON.stringify(answer);

  for (const secret of ['$2b$12$notarealhash', 'paidUntil', 'applicationStatus']) {
    assert.ok(!raw.includes(secret), `the answer carried ${secret}`);
  }
});

test('a discount is the same machine without a title', async () => {
  const created = await createDiscount(
    MEMBER_ID,
    {
      description: '10% para afiliados',
      conditions: 'Presentar carné',
      validUntil: TOMORROW.toISOString(),
    },
    async (fields) => ({
      _id: PROMOTION_ID,
      ...fields,
      isActive: true,
      adminStatus: 'active',
      createdAt: NOW,
    }),
    now,
  );

  assert.equal(created.description, '10% para afiliados');
  assert.equal('title' in created, false);

  const filters = [];
  await listDiscounts(
    { name: 'afiliados' },
    owners([]),
    async (filter) => {
      filters.push(filter);
      return [];
    },
    async () => 0,
    now,
  );

  assert.match('10% para afiliados', filters[0].description);
});
