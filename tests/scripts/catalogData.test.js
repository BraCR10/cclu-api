const test = require('node:test');
const assert = require('node:assert/strict');
const cantons = require('../../scripts/data/cantons.json');
const activities = require('../../scripts/data/activities.json');

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
  assert.equal(new Set(activities.map((activity) => activity.name)).size, activities.length);
});

test('every entry carries the fields its model requires', () => {
  for (const canton of cantons) {
    assert.equal(typeof canton.name, 'string');
    assert.ok(canton.name.trim().length > 0);
    assert.ok(PROVINCES.includes(canton.province), `${canton.name} names an unexpected province`);
  }

  for (const activity of activities) {
    assert.equal(typeof activity.name, 'string');
    assert.ok(activity.name.trim().length > 0);
    assert.deepEqual(Object.keys(activity), ['name']);
  }
});

// Written out rather than derived from the seed, so changing one of them has to
// face the other. These are what the form offers until the chamber loads the
// municipality's patent roll, which is a far longer list.
const SETTLED_ACTIVITIES = [
  'comercios',
  'alimentos y bebidas',
  'servicios profesionales',
  'salud y bienestar',
  'tecnología',
  'turismo y hospedaje',
  'manufactura',
  'construcción',
  'agropecuario',
];

test('the activities the registration form offers are the ones defined, in their order', () => {
  assert.deepEqual(
    activities.map((activity) => activity.name.toLowerCase()),
    SETTLED_ACTIVITIES,
  );
});

// "Otro" is not a name anybody trades under, and the form answers it with its
// own escape hatch: an applicant writes the activity out instead.
test('the catalog carries no catch-all entry', () => {
  assert.ok(!activities.some((activity) => activity.name.toLowerCase() === 'otro'));
});
