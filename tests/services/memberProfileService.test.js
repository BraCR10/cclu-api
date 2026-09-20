const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChanges, updateProfile } = require('../../src/services/memberProfileService');
const { ValidationError } = require('../../src/config/memberRules');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const SECTOR_ID = '65f0c3a1b2c3d4e5f6a7b8ca';

const noReferences = [];
const referenceTo = (id) => [
  {
    field: 'sector',
    model: { findById: () => ({ select: () => ({ lean: async () => ({ _id: id }) }) }) },
  },
];

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a field the member may change is applied', async () => {
  const { changes } = await buildChanges({ businessName: '  Panadería Nueva  ' }, noReferences);

  assert.deepEqual(changes, { businessName: 'Panadería Nueva' });
});

// The list of editable fields is the whole defence. Anything outside it is not
// rejected, it is simply never read.
test('nothing outside the editable list survives, however it is sent', async () => {
  const { changes, unset } = await buildChanges(
    {
      businessName: 'Panadería',
      email: 'otro@example.cr',
      identificationNumber: '999999999',
      memberCode: 'MA7K2Q4',
      applicationStatus: 'approved',
      accountStatus: 'active',
      role: 'admin',
      passwordHash: 'anything',
      reviewedBy: MEMBER_ID,
    },
    noReferences,
  );

  assert.deepEqual(Object.keys(changes), ['businessName']);
  assert.deepEqual(unset, {});
});

test('an optional field sent empty is removed rather than stored blank', async () => {
  const { changes, unset } = await buildChanges({ instagram: '' }, noReferences);

  assert.deepEqual(changes, {});
  assert.deepEqual(unset, { instagram: '' });
});

test('a required field cannot be emptied the same way', async () => {
  const error = await refusal(() => buildChanges({ businessName: '   ' }, noReferences));

  assert.equal(error.statusCode, 400);
});

test('an operator never becomes part of the update', async () => {
  for (const body of [{ businessName: { $ne: null } }, { phone: ['8888'] }, { location: 12 }]) {
    const error = await refusal(() => buildChanges(body, noReferences));

    assert.ok(error instanceof ValidationError);
  }
});

test('a link must carry a scheme that a browser will not run as code', async () => {
  for (const website of ['javascript:alert(1)', 'data:text/html,<script>', 'ftp://x.cr']) {
    const error = await refusal(() => buildChanges({ website }, noReferences));

    assert.equal(error.statusCode, 400);
  }

  const { changes } = await buildChanges({ website: 'https://panaderia.cr' }, noReferences);
  assert.equal(changes.website, 'https://panaderia.cr');
});

test('a reference is resolved against what exists, not taken on trust', async () => {
  const { changes } = await buildChanges({ sector: SECTOR_ID }, referenceTo(SECTOR_ID));

  assert.equal(changes.sector, SECTOR_ID);
});

test('a body that changes nothing is refused instead of writing an empty update', async () => {
  for (const body of [{}, { nothingReal: 'x' }]) {
    const error = await refusal(() => buildChanges(body, noReferences));

    assert.match(error.message, /changes nothing/);
  }
});

test('a body that is not an object is refused', async () => {
  for (const body of [null, undefined, 'text', ['a']]) {
    await refusal(() => buildChanges(body, noReferences));
  }
});

test('the answer carries one state instead of the two fields that confuse', async () => {
  const stored = {
    businessName: 'Panadería',
    email: 'socio@example.cr',
    applicationStatus: 'rejected',
    accountStatus: 'active',
  };

  const profile = await updateProfile(
    MEMBER_ID,
    { businessName: 'Panadería' },
    async () => stored,
    noReferences,
  );

  assert.equal(profile.state, 'rejected');
  assert.equal(profile.applicationStatus, undefined);
  assert.equal(profile.accountStatus, undefined);
});

test('an account that vanished between the gate and the write is a not found', async () => {
  const error = await refusal(() =>
    updateProfile(MEMBER_ID, { businessName: 'X' }, async () => null, noReferences),
  );

  assert.equal(error.statusCode, 404);
});
