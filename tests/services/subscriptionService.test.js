const test = require('node:test');
const assert = require('node:assert/strict');
const { subscribe } = require('../../src/services/subscriptionService');

const NOW = new Date('2026-10-20T12:00:00Z');
const CANTON = '6aaf2cf895dc1da3c7333013';

const VALID = {
  name: 'Mariana Solís',
  email: 'Mariana@CafeLomaVerde.cr',
  whatsappNumber: '8845 1290',
  canton: CANTON,
  district: 'San Juan',
  acceptsPromotions: true,
};

function memoryStore(existing = null) {
  const written = { created: [], resubscribed: [] };

  return {
    written,
    readCanton: async (body) => body.canton,
    findByEmail: async () => existing,
    create: async (fields) => written.created.push(fields),
    resubscribe: async (email, fields) => written.resubscribed.push({ email, fields }),
  };
}

test('a new address is subscribed with the moment it consented, in lower case', async () => {
  const store = memoryStore();

  await subscribe(VALID, NOW, store);

  assert.equal(store.written.created[0].email, 'mariana@cafelomaverde.cr');
  assert.equal(store.written.created[0].consentedAt, NOW);
});

test('nobody is subscribed without accepting the promotions', async () => {
  const store = memoryStore();

  await assert.rejects(() => subscribe({ ...VALID, acceptsPromotions: false }, NOW, store), {
    code: 'consents_required',
  });
  assert.equal(store.written.created.length, 0);
});

test('an address already subscribed is told so on its field', async () => {
  await assert.rejects(() => subscribe(VALID, NOW, memoryStore({ status: 'subscribed' })), {
    code: 'already_subscribed',
    field: 'email',
    statusCode: 409,
  });
});

test('an address that left is welcomed back rather than refused', async () => {
  const store = memoryStore({ status: 'unsubscribed' });

  await subscribe(VALID, NOW, store);

  assert.equal(store.written.resubscribed[0].email, 'mariana@cafelomaverde.cr');
  assert.equal(store.written.created.length, 0);
});

test('a missing district or an address that is not one is refused on its field', async () => {
  for (const [body, field] of [
    [{ ...VALID, district: '' }, 'district'],
    [{ ...VALID, email: 'mariana' }, 'email'],
    [{ ...VALID, name: undefined }, 'name'],
  ]) {
    await assert.rejects(() => subscribe(body, NOW, memoryStore()), { field });
  }
});
