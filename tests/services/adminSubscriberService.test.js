const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listSubscribers,
  exportSubscribers,
  listSubscriberDistricts,
} = require('../../src/services/adminSubscriberService');

const CANTON = '6aaf2cf895dc1da3c7333013';
const SUBSCRIBER = {
  _id: 's1',
  name: '=HYPERLINK("http://evil")',
  email: 'mariana@cafelomaverde.cr',
  whatsappNumber: '8845 1290',
  canton: { name: 'La Unión', province: 'Cartago' },
  district: 'San Juan',
  status: 'subscribed',
  consentedAt: new Date('2026-09-30T15:00:00Z'),
};

function memoryStore() {
  const filters = [];

  return {
    filters,
    list: async (filter) => {
      filters.push(filter);
      return [SUBSCRIBER];
    },
    count: async () => 1,
    all: async (filter) => {
      filters.push(filter);
      return [SUBSCRIBER];
    },
    districts: async () => ['San Juan', 'san juan', 'Tres Ríos'],
  };
}

test('the search looks in the name, the address and the WhatsApp, as typed', async () => {
  const store = memoryStore();

  await listSubscribers({ search: '88.45' }, store);

  const [byName, byEmail, byWhatsapp] = store.filters[0].$or;
  assert.equal(byName.name.$regex, '88\\.45');
  assert.ok(byEmail.email && byWhatsapp.whatsappNumber);
});

test('a status, canton or district outside what the list offers is refused', async () => {
  for (const query of [{ status: 'banned' }, { canton: 'La Unión' }, { district: 'San Juan' }]) {
    await assert.rejects(() => listSubscribers(query, memoryStore()), { name: 'ValidationError' });
  }
});

test('the export carries every match in Spanish, with a typed formula kept as text', async () => {
  const csv = await exportSubscribers({ status: 'subscribed', canton: CANTON }, memoryStore());

  assert.ok(csv.includes('Nombre,Correo electrónico'));
  assert.ok(csv.includes('"\'=HYPERLINK(""http://evil"")"'));
  assert.ok(csv.includes('2026-09-30,Suscrito'));
});

test('a district written twice with different case is offered once', async () => {
  const { districts } = await listSubscriberDistricts({ canton: CANTON }, memoryStore());

  assert.deepEqual(districts, ['San Juan', 'Tres Ríos']);
});
