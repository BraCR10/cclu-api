const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerMember,
  buildRegistration,
} = require('../../src/services/memberRegistrationService');
const { ValidationError } = require('../../src/config/memberRules');
const { MEMBER_TYPES, IDENTIFICATION_TYPES } = require('../../src/models/Member');
const { ROLES } = require('../../src/config/roles');

const CANTON_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const SECTOR_ID = '65f0c3a1b2c3d4e5f6a7b8ca';

const REFERENCES = [
  {
    field: 'canton',
    model: { findById: () => ({ select: () => ({ lean: async () => ({ _id: CANTON_ID }) }) }) },
  },
  {
    field: 'sector',
    model: { findById: () => ({ select: () => ({ lean: async () => ({ _id: SECTOR_ID }) }) }) },
  },
];

const NOTHING_FOUND = [
  { field: 'canton', model: { findById: () => ({ select: () => ({ lean: async () => null }) }) } },
  {
    field: 'sector',
    model: { findById: () => ({ select: () => ({ lean: async () => ({ _id: SECTOR_ID }) }) }) },
  },
];

function validBody(overrides = {}) {
  return {
    email: 'comercio@cclu.cr',
    phone: '22222222',
    canton: CANTON_ID,
    location: 'Frente al parque',
    sector: SECTOR_ID,
    memberType: MEMBER_TYPES.BUSINESS,
    identificationType: IDENTIFICATION_TYPES.LEGAL_ENTITY_ID,
    identificationNumber: '3101123456',
    businessName: 'Panadería La Unión',
    businessDescription: 'Panadería artesanal',
    password: 'Contrasena1!',
    ...overrides,
  };
}

test('a registration arrives without a role or an application status, whatever was sent', async () => {
  const registration = await buildRegistration(
    validBody({ role: ROLES.ADMIN, applicationStatus: 'approved', accountStatus: 'active' }),
    REFERENCES,
  );

  assert.equal(registration.role, undefined);
  assert.equal(registration.applicationStatus, undefined);
  assert.equal(registration.accountStatus, undefined);
});

test('nothing outside the accepted list is carried into the document', async () => {
  const registration = await buildRegistration(
    validBody({ memberCode: 'MA7K2Q4', _id: 'forced', statusReason: 'ya aprobado' }),
    REFERENCES,
  );

  assert.equal(registration.memberCode, undefined);
  assert.equal(registration._id, undefined);
  assert.equal(registration.statusReason, undefined);
});

test('the password is stored only as a hash', async () => {
  const registration = await buildRegistration(validBody(), REFERENCES);

  assert.equal(registration.password, undefined);
  assert.match(registration.passwordHash, /^\$2[aby]\$12\$/);
});

test('a field that must be text is refused when it arrives as an operator', async () => {
  for (const field of ['email', 'identificationNumber', 'businessName']) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: { $ne: null } }), REFERENCES),
      ValidationError,
    );
  }
});

test('a missing required field stops the registration', async () => {
  for (const field of ['email', 'phone', 'location', 'businessName']) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: undefined }), REFERENCES),
      ValidationError,
    );
    await assert.rejects(
      buildRegistration(validBody({ [field]: '   ' }), REFERENCES),
      ValidationError,
    );
  }
});

test('an optional field is simply absent rather than empty', async () => {
  const registration = await buildRegistration(validBody({ instagram: '  ' }), REFERENCES);

  assert.equal('instagram' in registration, false);
});

test('a choice outside the accepted values is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ memberType: 'administrator' }), REFERENCES),
    ValidationError,
  );
  await assert.rejects(
    buildRegistration(validBody({ identificationType: 'inventado' }), REFERENCES),
    ValidationError,
  );
});

test('a password shorter than the minimum is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ password: 'corta' }), REFERENCES),
    ValidationError,
  );
  await assert.rejects(
    buildRegistration(validBody({ password: { $ne: null } }), REFERENCES),
    ValidationError,
  );
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
  await assert.rejects(buildRegistration(validBody(), NOTHING_FOUND), ValidationError);
});

test('a duplicate identifier answers without confirming whose it is', async () => {
  const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

  await assert.rejects(
    registerMember(
      validBody(),
      () => {
        throw duplicate;
      },
      REFERENCES,
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
    async (document) => ({ _id: '65f0c3a1b2c3d4e5f6a7b8cb', ...document }),
    REFERENCES,
  );

  assert.deepEqual(stored, { id: '65f0c3a1b2c3d4e5f6a7b8cb' });
});

test('every field that must be text is refused when it arrives as an operator', async () => {
  const textFields = [
    'email',
    'phone',
    'location',
    'identificationNumber',
    'businessName',
    'businessDescription',
    'memberType',
    'identificationType',
    'canton',
    'sector',
    'instagram',
    'website',
  ];

  for (const field of textFields) {
    await assert.rejects(
      buildRegistration(validBody({ [field]: { $ne: null } }), REFERENCES),
      ValidationError,
      `${field} was accepted as an operator`,
    );
  }
});

test('a field longer than allowed is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ businessDescription: 'a'.repeat(501) }), REFERENCES),
    ValidationError,
  );

  const accepted = await buildRegistration(
    validBody({ businessDescription: 'a'.repeat(500) }),
    REFERENCES,
  );

  assert.equal(accepted.businessDescription.length, 500);
});

test('a password longer than the hash can read is refused', async () => {
  await assert.rejects(
    buildRegistration(validBody({ password: `A1!${'a'.repeat(70)}` }), REFERENCES),
    ValidationError,
  );

  const accepted = await buildRegistration(
    validBody({ password: `A1!${'a'.repeat(69)}` }),
    REFERENCES,
  );

  assert.ok(accepted.passwordHash);
});

test('a link that is not a web address is refused', async () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.cr', 'x.cr']) {
    await assert.rejects(
      buildRegistration(validBody({ website: value }), REFERENCES),
      ValidationError,
      `${value} was accepted as a link`,
    );
  }

  const accepted = await buildRegistration(
    validBody({ website: 'https://panaderia.cr' }),
    REFERENCES,
  );

  assert.equal(accepted.website, 'https://panaderia.cr');
});
