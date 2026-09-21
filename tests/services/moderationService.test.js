const test = require('node:test');
const assert = require('node:assert/strict');
const { listPublications, moderatePublication } = require('../../src/services/moderationService');

const PUBLICATION_ID = '65f0c3a1b2c3d4e5f6a7b8cb';

function publication(overrides = {}) {
  return {
    _id: PUBLICATION_ID,
    member: { businessName: 'Panadería Tres Ríos', memberCode: 'MA7K2Q4' },
    title: '2x1 en pan dulce',
    description: '10% para afiliados',
    isActive: true,
    adminStatus: 'active',
    validUntil: new Date('2026-09-30T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  };
}

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a type outside the four the chamber moderates is refused', async () => {
  for (const type of [undefined, null, 'members', 'secrets']) {
    const error = await refusal(() => listPublications({ type }));

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'type');
  }
});

test('the moderation list carries every state, blocked and hidden included', async () => {
  const rows = [publication(), publication({ _id: 'x', adminStatus: 'blocked', isActive: false })];

  const answer = await listPublications(
    { type: 'promotions' },
    async () => rows,
    async () => 2,
  );

  assert.equal(answer.total, 2);
  assert.equal(answer.items[0].type, 'promotions');
  assert.equal(answer.items[0].title, '2x1 en pan dulce');
  assert.equal(answer.items[1].adminStatus, 'blocked');
  assert.deepEqual(answer.items[0].business, {
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
  });
});

test('a discount is identified by its description, having no title', async () => {
  const answer = await listPublications(
    { type: 'discounts' },
    async () => [publication()],
    async () => 1,
  );

  assert.equal(answer.items[0].title, '10% para afiliados');
});

test('each action lands on the state it names', async () => {
  for (const [action, adminStatus] of [
    ['deactivate', 'inactive'],
    ['reactivate', 'active'],
    ['block', 'blocked'],
  ]) {
    const applied = [];
    const moderated = await moderatePublication(
      'products',
      PUBLICATION_ID,
      { action },
      async () => publication(),
      async (definition, id, status) => {
        applied.push(status);
        return publication({ adminStatus: status });
      },
    );

    assert.deepEqual(applied, [adminStatus]);
    assert.equal(moderated.adminStatus, adminStatus);
  }
});

test('an action outside the accepted three is refused', async () => {
  const error = await refusal(() =>
    moderatePublication('products', PUBLICATION_ID, { action: 'delete' }, async () =>
      publication(),
    ),
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, 'action');
});

test('a blocked publication does not reopen, not even from this side', async () => {
  const error = await refusal(() =>
    moderatePublication(
      'products',
      PUBLICATION_ID,
      { action: 'reactivate' },
      async () => publication({ adminStatus: 'blocked' }),
      async () => {
        throw new Error('nothing should be applied to a blocked publication');
      },
    ),
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, 'blocked_publication');
});

test('a publication that never existed answers not found', async () => {
  const error = await refusal(() =>
    moderatePublication('jobs', PUBLICATION_ID, { action: 'block' }, async () => null),
  );

  assert.equal(error.statusCode, 404);
});
