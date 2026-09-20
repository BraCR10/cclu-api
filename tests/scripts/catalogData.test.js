const test = require('node:test');
const assert = require('node:assert/strict');
const cantons = require('../../scripts/data/cantons.json');
const sectors = require('../../scripts/data/sectors.json');

// The chamber sits in La Unión, and these two provinces are the area it draws
// from. A canton outside them would offer a member a place the chamber does
// not serve.
const PROVINCES = ['San José', 'Cartago'];

test('the cantons cover exactly the two provinces the chamber serves', () => {
  assert.deepEqual([...new Set(cantons.map((canton) => canton.province))].sort(), [
    'Cartago',
    'San José',
  ]);

  for (const province of PROVINCES) {
    assert.ok(
      cantons.some((canton) => canton.province === province),
      `${province} has no cantons`,
    );
  }
});

test('Costa Rica has twenty cantons in San José and eight in Cartago', () => {
  assert.equal(cantons.filter((canton) => canton.province === 'San José').length, 20);
  assert.equal(cantons.filter((canton) => canton.province === 'Cartago').length, 8);
});

test('the canton the chamber is named after is in the list', () => {
  const laUnion = cantons.find((canton) => canton.name === 'La Unión');

  assert.ok(laUnion, 'La Unión is missing');
  assert.equal(laUnion.province, 'Cartago');
});

// A repeated name would be refused by the unique index halfway through the
// seed, leaving the catalog partly written.
test('no name is repeated in either catalog', () => {
  assert.equal(new Set(cantons.map((canton) => canton.name)).size, cantons.length);
  assert.equal(new Set(sectors.map((sector) => sector.name)).size, sectors.length);
});

test('every entry carries the fields its model requires', () => {
  for (const canton of cantons) {
    assert.equal(typeof canton.name, 'string');
    assert.ok(canton.name.trim().length > 0);
    assert.ok(PROVINCES.includes(canton.province), `${canton.name} names an unexpected province`);
  }

  for (const sector of sectors) {
    assert.equal(typeof sector.name, 'string');
    assert.ok(sector.name.trim().length > 0);
    assert.deepEqual(Object.keys(sector), ['name']);
  }
});

test('the ten sectors the registration form offers are the ones defined', () => {
  assert.equal(sectors.length, 10);
  assert.ok(
    sectors.some((sector) => sector.name === 'Otro'),
    'a business that fits nothing else has nowhere to go',
  );
});

// The ERS lists these by name in the registration fields of RF-AG-001. Written
// out here rather than derived, so a change to either side has to face the
// other one.
const SECTORS_IN_THE_SPECIFICATION = [
  'comercios',
  'alimentos y bebidas',
  'servicios profesionales',
  'salud y bienestar',
  'tecnología',
  'turismo y hospedaje',
  'manufactura',
  'construcción',
  'agropecuario',
  'otro',
];

test('the sectors are the ones the specification names, in its order', () => {
  assert.deepEqual(
    sectors.map((sector) => sector.name.toLowerCase()),
    SECTORS_IN_THE_SPECIFICATION,
  );
});
