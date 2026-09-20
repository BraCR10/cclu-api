const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueResubmissionToken,
  readRejectedRegistration,
  resubmitRegistration,
  buildCorrections,
  digestOf,
} = require('../../src/services/resubmissionService');

const TOKEN = 'a'.repeat(64);

function rejectedMember(overrides = {}) {
  return {
    _id: '65f0c3a1b2c3d4e5f6a7b8c9',
    email: 'socio@example.cr',
    businessName: 'Panadería Tres Ríos',
    businessDescription: 'Panadería artesanal.',
    phone: '22791234',
    location: 'Centro',
    instagram: '@panaderia',
    applicationStatus: 'rejected',
    statusReason: 'La cédula no se pudo verificar.',
    resubmissionTokenHash: digestOf(TOKEN),
    resubmissionExpiresAt: new Date(Date.now() + 86_400_000),
    saved: false,
    async save() {
      this.saved = true;
    },
    ...overrides,
  };
}

const finding = (member) => async () => member;
const neverAsked = async () => {
  throw new Error('the database was queried for a token that could not exist');
};

async function refused(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('the stored digest is not the token, so a leaked database opens nothing', async () => {
  const saved = [];
  const { token } = await issueResubmissionToken('65f0c3a1b2c3d4e5f6a7b8c9', async (id, fields) =>
    saved.push(fields),
  );

  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(saved[0].resubmissionTokenHash, token);
  assert.equal(saved[0].resubmissionTokenHash, digestOf(token));
  assert.ok(saved[0].resubmissionExpiresAt > new Date());
});

test('a token that is not one never reaches the database', async () => {
  for (const token of [undefined, null, '', 'corto', { $ne: null }, 42, 'z'.repeat(64)]) {
    await refused(() => readRejectedRegistration(token, neverAsked));
  }
});

test('a token nobody was issued is refused', async () => {
  assert.equal(
    (await refused(() => readRejectedRegistration(TOKEN, finding(null)))).statusCode,
    404,
  );
});

test('a link that ran out of time is refused', async () => {
  const error = await refused(() =>
    readRejectedRegistration(
      TOKEN,
      finding(rejectedMember({ resubmissionExpiresAt: new Date(Date.now() - 1000) })),
    ),
  );

  assert.equal(error.statusCode, 404);
});

// Only a rejection opens this door. An application already approved or back
// under review has nothing to resubmit.
test('a link is refused once the application is no longer rejected', async () => {
  for (const applicationStatus of ['approved', 'pending_review', 'changes_requested']) {
    const error = await refused(() =>
      readRejectedRegistration(TOKEN, finding(rejectedMember({ applicationStatus }))),
    );

    assert.equal(error.statusCode, 404);
  }
});

test('the link shows what to correct and why it was refused', async () => {
  const registration = await readRejectedRegistration(TOKEN, finding(rejectedMember()));

  assert.equal(registration.reason, 'La cédula no se pudo verificar.');
  assert.equal(registration.businessName, 'Panadería Tres Ríos');
  assert.equal(registration.email, 'socio@example.cr');
});

test('nothing outside the correctable list survives, however it is sent', async () => {
  const { changes } = buildCorrections({
    phone: '22790000',
    location: 'Nueva dirección',
    businessName: 'Panadería Corregida',
    businessDescription: 'Corregida.',
    email: 'otro@example.cr',
    applicationStatus: 'approved',
    memberCode: 'MA7K2Q4',
    identificationNumber: '999999999',
    passwordHash: 'x',
    resubmissionTokenHash: 'x',
  });

  assert.deepEqual(Object.keys(changes).sort(), [
    'businessDescription',
    'businessName',
    'location',
    'phone',
  ]);
});

test('an operator never becomes part of the correction', async () => {
  for (const body of [{ phone: { $ne: null } }, null, 'texto', ['a']]) {
    await refused(async () => buildCorrections(body));
  }
});

test('a resubmission goes back under review and spends its link', async () => {
  const member = rejectedMember({ reviewedBy: 'someone', reviewedAt: new Date() });

  const answer = await resubmitRegistration(
    TOKEN,
    {
      phone: '22790000',
      location: 'Nueva dirección',
      businessName: 'Panadería Corregida',
      businessDescription: 'Corregida.',
    },
    finding(member),
  );

  assert.equal(answer.applicationStatus, 'pending_review');
  assert.equal(member.businessName, 'Panadería Corregida');
  assert.equal(member.statusReason, undefined);
  assert.equal(member.reviewedBy, null);
  assert.equal(member.reviewedAt, null);
  assert.equal(member.resubmissionTokenHash, null);
  assert.equal(member.saved, true);
});

test('the same link cannot be used twice', async () => {
  const member = rejectedMember();
  const corrections = {
    phone: '22790000',
    location: 'Centro',
    businessName: 'Panadería',
    businessDescription: 'Corregida.',
  };

  await resubmitRegistration(TOKEN, corrections, finding(member));

  // Back under review and with the digest gone, the link no longer opens it.
  const error = await refused(() => resubmitRegistration(TOKEN, corrections, finding(member)));

  assert.equal(error.statusCode, 404);
});

test('a missing required correction is refused before anything is written', async () => {
  const member = rejectedMember();

  await refused(() => resubmitRegistration(TOKEN, { phone: '22790000' }, finding(member)));

  assert.equal(member.saved, false);
  assert.equal(member.applicationStatus, 'rejected');
});
