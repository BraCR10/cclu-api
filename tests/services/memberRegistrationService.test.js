const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerMember,
  buildRegistration,
} = require('../../src/services/memberRegistrationService');
const { ValidationError } = require('../../src/config/memberRules');
const {
  MEMBER_TYPES,
  BRANCH_MODALITIES,
  IDENTIFICATION_TYPES,
} = require('../../src/models/Member');
const { ROLES } = require('../../src/config/roles');

const CANTON_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ACTIVITY_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const SOMEONE_ELSE = '65f0c3a1b2c3d4e5f6a7b8cb';

const CONSENTS = { statutes: true, marketplaceTerms: true, privacyPolicy: true };

function foundOnReference(id) {
  return { findById: () => ({ select: () => ({ lean: async () => ({ _id: id }) }) }) };
}

function namesNothing() {
  return { findById: () => ({ select: () => ({ lean: async () => null }) }) };
}

// The two references the form resolves, with the canton's answer under the test's
// control: an activity may be written out instead, so only the canton has to
// exist for every body.
function references({ canton = foundOnReference(CANTON_ID) } = {}) {
  return [
    { field: 'canton', model: canton },
    { field: 'activity', model: foundOnReference(ACTIVITY_ID), required: false },
  ];
}

// A registration as the form sends it: an empresa, with everything the three
// steps ask for.
function validBody(overrides = {}) {
  return {
    memberType: MEMBER_TYPES.BUSINESS,
    identificationType: IDENTIFICATION_TYPES.LEGAL_ENTITY_ID,
    identificationNumber: '3101123456',
    legalName: 'Panadería La Unión Sociedad Anónima',
    legalRepresentativeName: 'Mariana Solís Quesada',
    legalRepresentativeIdentification: '112340567',
    certificationFileKey: 'member-certifications/panaderia-la-union.pdf',
    certificationIssuedAt: '2026-09-15',
    businessName: 'Panadería La Unión',
    managerName: 'Mariana Solís Quesada',
    activity: ACTIVITY_ID,
    businessDescription: 'Panadería artesanal',
    branchModality: BRANCH_MODALITIES.PHYSICAL,
    branchName: 'Sucursal San Juan',
    canton: CANTON_ID,
    district: 'San Juan',
    location: 'Frente al parque',
    institutionalPhone: '22223333',
    email: 'comercio@cclu.cr',
    phone: '22222222',
    whatsappNumber: '88888888',
    billingEmail: 'facturacion@cclu.cr',
    password: 'Contrasena1!',
    consents: CONSENTS,
    ...overrides,
  };
}

// The independent professional sends a shorter body: their own name, and no
// personería jurídica to upload.
function independentBody(overrides = {}) {
  return {
    memberType: MEMBER_TYPES.INDEPENDENT_PROFESSIONAL,
    identificationType: IDENTIFICATION_TYPES.NATIONAL_ID,
    identificationNumber: '112340567',
    name: 'Mariana Solís Quesada',
    businessName: 'Solís Diseño',
    managerName: 'Mariana Solís Quesada',
    activityOther: 'Tostaduría de café de especialidad',
    businessDescription: 'Diseño de marcas',
    branchModality: BRANCH_MODALITIES.VIRTUAL,
    branchName: 'Oficina virtual',
    canton: CANTON_ID,
    district: 'San Juan',
    institutionalPhone: '22223333',
    email: 'mariana@cclu.cr',
    phone: '22222222',
    whatsappNumber: '88888888',
    billingEmail: 'facturacion@cclu.cr',
    password: 'Contrasena1!',
    consents: CONSENTS,
    ...overrides,
  };
}

test('a registration arrives without a role or an application status, whatever was sent', async () => {
  const registration = await buildRegistration(
    validBody({ role: ROLES.ADMIN, applicationStatus: 'approved', accountStatus: 'active' }),
    references(),
  );

  assert.equal(registration.role, undefined);
  assert.equal(registration.applicationStatus, undefined);
  assert.equal(registration.accountStatus, undefined);
});

test('nothing outside the accepted list is carried into the document', async () => {
  const registration = await buildRegistration(
    validBody({ memberCode: 'MA7K2Q4', _id: 'forced', statusReason: 'ya aprobado' }),
    references(),
  );

  assert.equal(registration.memberCode, undefined);
  assert.equal(registration._id, undefined);
  assert.equal(registration.statusReason, undefined);
});

// There is no sector: the chamber groups members by economic activity, and a
// body that still carries the old field is simply not read.
test('a sector somebody still sends is ignored', async () => {
  const registration = await buildRegistration(validBody({ sector: SOMEONE_ELSE }), references());

  assert.equal(registration.sector, undefined);
});

test('the three consents are recorded with the moment they were given', async () => {
  const registration = await buildRegistration(validBody(), references());

  assert.deepEqual(registration.consents, CONSENTS);
  assert.ok(registration.consentedAt instanceof Date);
});

test('the password is stored only as a hash', async () => {
  const registration = await buildRegistration(validBody(), references());

  assert.equal(registration.password, undefined);
  assert.match(registration.passwordHash, /^\$2[aby]\$12\$/);
});

test('the certification is stored as a day, not an instant', async () => {
  const registration = await buildRegistration(validBody(), references());

  assert.equal(registration.certificationIssuedAt.toISOString(), '2026-09-15T00:00:00.000Z');
});

test('a field that must be text is refused when it arrives as an operator', async () => {
  for (const field of ['email', 'identificationNumber', 'businessName', 'district']) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: { $ne: null } }), references()),
      ValidationError,
    );
  }
});

test('every field that must be text is refused when it arrives as an operator', async () => {
  const textFields = [
    'email',
    'phone',
    'whatsappNumber',
    'billingEmail',
    'identificationNumber',
    'legalName',
    'legalRepresentativeName',
    'legalRepresentativeIdentification',
    'businessName',
    'managerName',
    'businessDescription',
    'branchName',
    'district',
    'institutionalPhone',
    'location',
    'memberType',
    'identificationType',
    'branchModality',
    'canton',
    'activity',
    'activityOther',
    'instagram',
    'website',
  ];

  for (const field of textFields) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: { $ne: null } }), references()),
      ValidationError,
      `${field} was accepted as an operator`,
    );
  }
});

test('a missing required field stops the registration', async () => {
  const required = [
    'email',
    'phone',
    'whatsappNumber',
    'billingEmail',
    'identificationNumber',
    'businessName',
    'managerName',
    'businessDescription',
    'branchName',
    'district',
    'institutionalPhone',
    'location',
    'canton',
  ];

  for (const field of required) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: undefined }), references()),
      ValidationError,
      `${field} was accepted as missing`,
    );
    await assert.rejects(
      buildRegistration(validBody({ [field]: '   ' }), references()),
      ValidationError,
      `${field} was accepted as blank`,
    );
  }
});

test('an optional field is simply absent rather than empty', async () => {
  const registration = await buildRegistration(validBody({ instagram: '  ' }), references());

  assert.equal('instagram' in registration, false);
});

test('a choice outside the accepted values is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ memberType: 'administrator' }), references()),
    ValidationError,
  );
  await assert.rejects(
    buildRegistration(validBody({ identificationType: 'inventado' }), references()),
    ValidationError,
  );
  await assert.rejects(
    buildRegistration(validBody({ branchModality: 'postal' }), references()),
    ValidationError,
  );
});

// What the applicant is decides which document proves them, and the form never
// offers the pair that does not go together.
test('an empresa is identified by its cédula jurídica', async () => {
  for (const identificationType of [
    IDENTIFICATION_TYPES.NATIONAL_ID,
    IDENTIFICATION_TYPES.DIMEX,
    IDENTIFICATION_TYPES.PASSPORT,
  ]) {
    await assert.rejects(
      buildRegistration(validBody({ identificationType }), references()),
      ValidationError,
      `${identificationType} was accepted for an empresa`,
    );
  }
});

test('a profesional independiente is identified by their own document', async () => {
  await assert.rejects(
    buildRegistration(
      independentBody({ identificationType: IDENTIFICATION_TYPES.LEGAL_ENTITY_ID }),
      references(),
    ),
    ValidationError,
  );

  for (const identificationType of [
    IDENTIFICATION_TYPES.NATIONAL_ID,
    IDENTIFICATION_TYPES.DIMEX,
    IDENTIFICATION_TYPES.PASSPORT,
  ]) {
    const registration = await buildRegistration(
      independentBody({ identificationType }),
      references(),
    );

    assert.equal(registration.identificationType, identificationType);
  }
});

// A person has no razón social, and a company has no personal name. Asking one
// for the other's field is how a form ends up refusing a real business.
test('a profesional independiente is named by their own name', async () => {
  const registration = await buildRegistration(independentBody(), references());

  assert.equal(registration.name, 'Mariana Solís Quesada');
  assert.equal(registration.legalName, undefined);

  await assert.rejects(
    buildRegistration(independentBody({ name: undefined }), references()),
    ValidationError,
  );
});

test('an empresa is named by its razón social and the person who answers for it', async () => {
  for (const field of [
    'legalName',
    'legalRepresentativeName',
    'legalRepresentativeIdentification',
  ]) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: undefined }), references()),
      ValidationError,
      `${field} was accepted as missing`,
    );
  }
});

test('an asociación is registered with the same data as an empresa', async () => {
  const registration = await buildRegistration(
    validBody({ memberType: MEMBER_TYPES.ASSOCIATION }),
    references(),
  );

  assert.equal(registration.memberType, MEMBER_TYPES.ASSOCIATION);
  assert.equal(registration.legalName, 'Panadería La Unión Sociedad Anónima');
  assert.equal(registration.certificationFileKey, 'member-certifications/panaderia-la-union.pdf');
});

// Only a company or an association has a personería jurídica, and the form says
// so to the professional who would otherwise be asked for one.
test('only an empresa or an asociación produces a personería jurídica', async () => {
  for (const field of ['certificationFileKey', 'certificationIssuedAt']) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: undefined }), references()),
      ValidationError,
      `${field} was accepted as missing for an empresa`,
    );
  }

  const registration = await buildRegistration(independentBody(), references());

  assert.equal(registration.certificationFileKey, undefined);
  assert.equal(registration.certificationIssuedAt, undefined);
});

// The catalog or the written activity, never neither: the chamber classifies
// every member it accepts.
test('the activity is one from the catalog or one written out', async () => {
  const fromCatalog = await buildRegistration(validBody(), references());

  assert.deepEqual(fromCatalog.activity, ACTIVITY_ID);
  assert.equal(fromCatalog.activityOther, undefined);

  const writtenOut = await buildRegistration(
    validBody({ activity: undefined, activityOther: 'Tostaduría de café' }),
    references(),
  );

  assert.equal(writtenOut.activity, undefined);

  await assert.rejects(
    buildRegistration(validBody({ activity: undefined }), references()),
    ValidationError,
  );
});

// The form calls the street optional for a business that sells online, and the
// API has to mean it.
test('a branch with a door needs a street address and one without does not', async () => {
  await assert.rejects(
    buildRegistration(validBody({ location: undefined }), references()),
    ValidationError,
  );

  const virtual = await buildRegistration(
    validBody({ branchModality: BRANCH_MODALITIES.VIRTUAL, location: undefined }),
    references(),
  );

  assert.equal(virtual.branchModality, BRANCH_MODALITIES.VIRTUAL);
  assert.equal(virtual.location, undefined);
});

test('each consent is required on its own', async () => {
  for (const field of ['statutes', 'marketplaceTerms', 'privacyPolicy']) {
    for (const value of [undefined, false, 'true']) {
      await assert.rejects(
        buildRegistration(validBody({ consents: { ...CONSENTS, [field]: value } }), references()),
        (error) => {
          assert.equal(error.field, field);
          return true;
        },
        `${field} was accepted as ${String(value)}`,
      );
    }
  }

  await assert.rejects(buildRegistration(validBody({ consents: undefined }), references()));
});

test('a date that is not a calendar day is refused', async () => {
  for (const value of ['2026-02-31', '15/09/2026', 'ayer', '2026-9-5']) {
    await assert.rejects(
      buildRegistration(validBody({ certificationIssuedAt: value }), references()),
      ValidationError,
      `${value} was accepted as a date`,
    );
  }
});

test('a file key that climbs out of its directory is refused', async () => {
  for (const value of ['../../etc/passwd', 'member-certifications/../admin.pdf']) {
    await assert.rejects(
      buildRegistration(validBody({ certificationFileKey: value }), references()),
      ValidationError,
      `${value} was accepted as a key`,
    );
  }

  const registration = await buildRegistration(validBody(), references());

  assert.equal(registration.certificationFileKey, 'member-certifications/panaderia-la-union.pdf');
});

test('a password shorter than the minimum is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ password: 'Corta1!' }), references()),
    ValidationError,
  );
  await assert.rejects(
    buildRegistration(validBody({ password: { $ne: null } }), references()),
    ValidationError,
  );

  // Exactly the ten characters the form asks for is enough, and the classes it
  // lists are still required of it.
  const accepted = await buildRegistration(validBody({ password: 'Contras1!!' }), references());

  assert.ok(accepted.passwordHash);
});

test('a reference is checked for shape before it reaches a query', async () => {
  let searched = false;
  const watching = [
    {
      field: 'canton',
      model: {
        findById: () => {
          searched = true;
          return { select: () => ({ lean: async () => null }) };
        },
      },
    },
  ];

  await assert.rejects(
    buildRegistration(validBody({ canton: 'not-an-identifier' }), watching),
    ValidationError,
  );
  assert.equal(searched, false);
});

test('a reference that names nothing is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody(), references({ canton: namesNothing() })),
    ValidationError,
  );
});

// The cross collection check is a database call, and these tests have no
// database. Held by nobody is the ordinary case, and the notice is injected for
// the same reason.
const HELD_BY_NOBODY = async () => false;
const NOTHING_TO_NOTIFY = async () => true;

test('a duplicate identifier answers without confirming whose it is', async () => {
  const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

  await assert.rejects(
    registerMember(
      validBody(),
      () => {
        throw duplicate;
      },
      references(),
      HELD_BY_NOBODY,
      NOTHING_TO_NOTIFY,
    ),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.ok(!error.message.includes('3101123456'));
      assert.ok(!/identification|cédula|email/i.test(error.message));
      return true;
    },
  );
});

test('a registration that succeeds answers with its identifier and nothing else', async () => {
  const stored = await registerMember(
    validBody(),
    async (document) => ({ _id: SOMEONE_ELSE, ...document }),
    references(),
    HELD_BY_NOBODY,
    NOTHING_TO_NOTIFY,
  );

  assert.deepEqual(stored, { id: SOMEONE_ELSE });
});

// The applicant hears back on the address they registered with, and the notice
// names the business the chamber will look at.
test('the applicant is written to as soon as the registration is stored', async () => {
  const notices = [];

  await registerMember(
    validBody(),
    async (document) => ({ _id: SOMEONE_ELSE, ...document }),
    references(),
    HELD_BY_NOBODY,
    async (registration) => {
      notices.push(registration);
      return true;
    },
  );

  assert.equal(notices.length, 1);
  assert.equal(notices[0].email, 'comercio@cclu.cr');
  assert.equal(notices[0].businessName, 'Panadería La Unión');
});

// Told apart, the public registration form becomes a way of asking the chamber
// who its administrators are, and anyone can open it.
test('an address an administrator holds is refused in the same words as any duplicate', async () => {
  const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  const refusals = [];

  for (const [create, heldByAnotherRole] of [
    [
      () => {
        throw duplicate;
      },
      HELD_BY_NOBODY,
    ],
    [
      () => assert.fail('the member was created although an administrator holds the address'),
      async () => true,
    ],
  ]) {
    await assert.rejects(
      registerMember(validBody(), create, references(), heldByAnotherRole, NOTHING_TO_NOTIFY),
      (error) => {
        refusals.push({ code: error.code, message: error.message, status: error.statusCode });
        return true;
      },
    );
  }

  assert.deepEqual(refusals[0], refusals[1]);
});

test('an address an administrator holds never reaches the collection', async () => {
  let created = false;

  await assert.rejects(
    registerMember(
      validBody(),
      async () => {
        created = true;
        return { _id: SOMEONE_ELSE };
      },
      references(),
      async () => true,
      NOTHING_TO_NOTIFY,
    ),
    ValidationError,
  );

  assert.equal(created, false);
});

test('a field longer than allowed is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ businessDescription: 'a'.repeat(501) }), references()),
    ValidationError,
  );

  const accepted = await buildRegistration(
    validBody({ businessDescription: 'a'.repeat(500) }),
    references(),
  );

  assert.equal(accepted.businessDescription.length, 500);
});

test('a password longer than the hash can read is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ password: `A1!${'a'.repeat(70)}` }), references()),
    ValidationError,
  );

  const accepted = await buildRegistration(
    validBody({ password: `A1!${'a'.repeat(69)}` }),
    references(),
  );

  assert.ok(accepted.passwordHash);
});

test('a link that is not a web address is refused', async () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.cr', 'x.cr']) {
    await assert.rejects(
      buildRegistration(validBody({ website: value }), references()),
      ValidationError,
      `${value} was accepted as a link`,
    );
  }

  const accepted = await buildRegistration(
    validBody({ website: 'https://panaderia.cr' }),
    references(),
  );

  assert.equal(accepted.website, 'https://panaderia.cr');
});
