const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueResubmissionToken,
  readCorrectableRegistration,
  resubmitRegistration,
  buildCorrections,
  digestOf,
  CORRECTABLE_FIELDS,
} = require('../../src/services/resubmissionService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');

const NO_NOTICE = async () => true;

const TOKEN = 'a'.repeat(64);
const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const CANTON_ID = '65f0c3a1b2c3d4e5f6a7b8cb';
const ACTIVITY_ID = '65f0c3a1b2c3d4e5f6a7b8cc';

// A value on every field the link may touch, so one that stops travelling back
// to the form is noticed.
function correctableMember(overrides = {}) {
  return {
    _id: MEMBER_ID,
    email: 'info@granjaorganicasanramon.cr',
    memberType: 'business',
    identificationType: 'legal_entity_id',
    identificationNumber: '3-102-650901',
    legalName: 'Granja Orgánica San Ramón Limitada',
    name: null,
    businessName: 'Granja Orgánica San Ramón',
    managerName: 'José Pablo Ureña Mata',
    activity: null,
    activityOther: 'Cultivo de hortalizas',
    businessDescription: 'Hortalizas de la zona.',
    logoFileKey: 'member-logos/logo.png',
    branchModality: 'physical',
    branchName: 'Finca San Ramón',
    canton: CANTON_ID,
    district: 'San Ramón',
    location: 'Frente a la plaza',
    institutionalPhone: '22791234',
    phone: '8710 3345',
    whatsappNumber: '8710 3345',
    billingEmail: 'facturacion@ejemplo.cr',
    instagram: '@granjaorganica',
    applicationStatus: APPLICATION_STATUSES.REJECTED,
    statusReason: 'La cédula jurídica no coincide con el nombre comercial.',
    changesRequestedFields: [],
    reviewedBy: null,
    reviewedAt: null,
    resubmissionTokenHash: digestOf(TOKEN),
    resubmissionExpiresAt: new Date(Date.now() + 86_400_000),
    saved: false,
    async save() {
      this.saved = true;
    },
    ...overrides,
  };
}

// What the correction form sends back: the fields the screen shows, and nothing
// else. The references are injected as an empty list in the tests that do not
// care about them, because what a correction hands the database is what is
// asserted here rather than what a lookup answers.
function corrections(overrides = {}) {
  return {
    memberType: 'business',
    identificationType: 'legal_entity_id',
    identificationNumber: '3-102-650901',
    legalName: 'Granja Orgánica San Ramón Limitada',
    businessName: 'Granja Orgánica San Ramón',
    managerName: 'José Pablo Ureña Mata',
    district: 'San Ramón',
    phone: '8710 3345',
    whatsappNumber: '8710 3345',
    activityOther: 'Cultivo de hortalizas',
    canton: CANTON_ID,
    ...overrides,
  };
}

// A model that answers with the reference it was asked for, and nothing else.
function catalog(id = ACTIVITY_ID) {
  return { findById: () => ({ select: () => ({ lean: async () => ({ _id: id }) }) }) };
}

const nothingInTheCatalog = {
  findById: () => ({ select: () => ({ lean: async () => null }) }),
};

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
  const { token } = await issueResubmissionToken(MEMBER_ID, async (id, fields) =>
    saved.push(fields),
  );

  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(saved[0].resubmissionTokenHash, token);
  assert.equal(saved[0].resubmissionTokenHash, digestOf(token));
  assert.ok(saved[0].resubmissionExpiresAt > new Date());
});

test('a token that is not one never reaches the database', async () => {
  for (const token of [undefined, null, '', 'corto', { $ne: null }, 42, 'z'.repeat(64)]) {
    await refused(() => readCorrectableRegistration(token, neverAsked));
  }
});

test('a token nobody was issued is refused', async () => {
  assert.equal(
    (await refused(() => readCorrectableRegistration(TOKEN, finding(null)))).statusCode,
    404,
  );
});

test('a link that ran out of time is refused', async () => {
  const error = await refused(() =>
    readCorrectableRegistration(
      TOKEN,
      finding(correctableMember({ resubmissionExpiresAt: new Date(Date.now() - 1000) })),
    ),
  );

  assert.equal(error.statusCode, 404);
});

// Both answers that leave the applicant with something to do open the same door.
test('the link opens for a rejection and for a request for changes', async () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.REJECTED,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
  ]) {
    const registration = await readCorrectableRegistration(
      TOKEN,
      finding(correctableMember({ applicationStatus })),
    );

    assert.equal(registration.businessName, 'Granja Orgánica San Ramón');
  }
});

// An application already approved, or one back under review, has nothing to
// resubmit.
test('a link is refused once the application is settled or under review', async () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.APPROVED,
    APPLICATION_STATUSES.PENDING_REVIEW,
  ]) {
    const error = await refused(() =>
      readCorrectableRegistration(TOKEN, finding(correctableMember({ applicationStatus }))),
    );

    assert.equal(error.statusCode, 404);
  }
});

test('the link carries every field it may correct, why, what was named and who decided', async () => {
  const named = [
    {
      field: 'identificationNumber',
      message: 'no coincide con la razón social registrada.',
    },
  ];

  const registration = await readCorrectableRegistration(
    TOKEN,
    finding(
      correctableMember({
        applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
        changesRequestedFields: named,
        reviewedBy: { name: 'Laura Jiménez Castro', email: 'laura@cclu.cr' },
        reviewedAt: new Date('2026-09-29T15:00:00.000Z'),
      }),
    ),
  );

  assert.deepEqual(
    Object.keys(registration).sort(),
    [
      ...CORRECTABLE_FIELDS,
      'email',
      'fields',
      'reason',
      'applicationStatus',
      'reviewedAt',
      'reviewedBy',
    ].sort(),
  );
  assert.deepEqual(registration.fields, named);
  assert.equal(registration.reason, 'La cédula jurídica no coincide con el nombre comercial.');
  assert.equal(registration.email, 'info@granjaorganicasanramon.cr');
  assert.equal(registration.reviewedBy, 'Laura Jiménez Castro');
  assert.equal(registration.district, 'San Ramón');
  assert.equal(registration.legalName, 'Granja Orgánica San Ramón Limitada');
});

// An administrator created before there were names has only an address, which is
// what the panel shows for them too.
test('a reviewer without a name is named by their address', async () => {
  const registration = await readCorrectableRegistration(
    TOKEN,
    finding(correctableMember({ reviewedBy: { name: null, email: 'laura@cclu.cr' } })),
  );

  assert.equal(registration.reviewedBy, 'laura@cclu.cr');
});

test('nothing outside the correctable list survives, however it is sent', async () => {
  const { changes } = await buildCorrections(
    {
      ...corrections(),
      email: 'otro@example.cr',
      applicationStatus: 'approved',
      memberCode: 'MA7K2Q4',
      businessDescription: 'Otra descripción.',
      logoFileKey: 'member-logos/otro.png',
      location: 'Otra dirección',
      billingEmail: 'otro@example.cr',
      passwordHash: 'x',
      resubmissionTokenHash: 'x',
    },
    [],
  );

  for (const field of Object.keys(changes)) {
    assert.ok(CORRECTABLE_FIELDS.includes(field), `${field} is not a correctable field`);
  }

  assert.equal(changes.businessName, 'Granja Orgánica San Ramón');
});

test('an operator never becomes part of the correction', async () => {
  for (const body of [{ ...corrections(), phone: { $ne: null } }, null, 'texto', ['a']]) {
    await refused(() => buildCorrections(body, []));
  }
});

// A person is not a company and a company has no name of its own, so whichever
// of the two does not go with the chosen type goes.
test('the identity that does not go with the chosen type is cleared', async () => {
  const person = await buildCorrections(
    {
      ...corrections(),
      memberType: 'independent_professional',
      identificationType: 'national_id',
      name: 'José Pablo Ureña Mata',
      legalName: '',
    },
    [],
  );

  assert.equal(person.changes.name, 'José Pablo Ureña Mata');
  assert.equal(person.changes.legalName, undefined);
  assert.equal(person.unset.legalName, '');

  const company = await buildCorrections(corrections({ name: 'José Pablo' }), []);

  assert.equal(company.unset.name, '');
});

test('an identification type that does not go with the member type is refused', async () => {
  const error = await refused(() =>
    buildCorrections({ ...corrections(), identificationType: 'national_id' }, []),
  );

  assert.deepEqual([error.code, error.field], ['not_allowed', 'identificationType']);
});

test('the activity is one from the catalog or one written out, and never neither', async () => {
  const neither = await refused(() =>
    buildCorrections({ ...corrections(), activityOther: '' }, []),
  );

  assert.deepEqual([neither.code, neither.field], ['required', 'activity']);

  const chosen = await buildCorrections({ ...corrections(), activity: ACTIVITY_ID }, [
    { field: 'activity', model: catalog(), required: false },
  ]);

  assert.equal(chosen.changes.activity, ACTIVITY_ID);
  // The written one goes, because the catalog one replaces it rather than
  // joining it.
  assert.equal(chosen.changes.activityOther, undefined);
  assert.equal(chosen.unset.activityOther, '');
  assert.equal(
    (await buildCorrections(corrections(), [{ field: 'canton', model: catalog(CANTON_ID) }]))
      .changes.canton,
    CANTON_ID,
  );
});

test('a reference that names nothing is refused', async () => {
  const error = await refused(() =>
    buildCorrections(corrections(), [
      { field: 'canton', model: nothingInTheCatalog, required: true },
    ]),
  );

  assert.deepEqual([error.code, error.field], ['unknown_reference', 'canton']);
});

// The document is unique across members, and this link is the one place where a
// stranger could type somebody else's and learn something from the answer.
test('a document another member holds is refused without naming whose it is', async () => {
  const member = correctableMember({
    async save() {
      const error = new Error('duplicate key');

      error.code = 11000;

      throw error;
    },
  });

  const error = await refused(() =>
    resubmitRegistration(TOKEN, corrections(), finding(member), [], NO_NOTICE),
  );

  assert.deepEqual(
    [error.code, error.field, error.statusCode],
    ['already_registered', 'identificationNumber', 409],
  );
});

test('a resubmission goes back under review and spends its link', async () => {
  const member = correctableMember({
    applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
    changesRequestedFields: [{ field: 'district', message: 'no coincide con el cantón.' }],
    reviewedBy: 'someone',
    reviewedAt: new Date(),
  });

  const answer = await resubmitRegistration(
    TOKEN,
    corrections({ businessName: 'Granja Orgánica San Ramón' }),
    finding(member),
    [],
    NO_NOTICE,
  );

  assert.equal(answer.applicationStatus, APPLICATION_STATUSES.PENDING_REVIEW);
  assert.equal(member.businessName, 'Granja Orgánica San Ramón');
  assert.equal(member.statusReason, undefined);
  assert.equal(member.changesRequestedFields, undefined);
  assert.equal(member.reviewedBy, null);
  assert.equal(member.reviewedAt, null);
  assert.equal(member.resubmissionTokenHash, null);
  assert.equal(member.saved, true);
});

test('the same link cannot be used twice', async () => {
  const member = correctableMember();

  await resubmitRegistration(TOKEN, corrections(), finding(member), [], NO_NOTICE);

  // Back under review and with the digest gone, the link no longer opens it.
  const error = await refused(() =>
    resubmitRegistration(TOKEN, corrections(), finding(member), [], NO_NOTICE),
  );

  assert.equal(error.statusCode, 404);
});

test('a missing required correction is refused before anything is written', async () => {
  const member = correctableMember();

  await refused(() =>
    resubmitRegistration(TOKEN, { phone: '22790000' }, finding(member), [], NO_NOTICE),
  );

  assert.equal(member.saved, false);
  assert.equal(member.applicationStatus, APPLICATION_STATUSES.REJECTED);
});
