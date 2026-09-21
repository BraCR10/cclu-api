const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyMemberCode } = require('../../src/services/memberVerificationService');
const {
  generateMemberCode,
  formatMemberCode,
  ALPHABET,
} = require('../../src/services/memberCodeService');

// Generated rather than written down, because a literal that fails the check
// digit would be refused before the lookup and prove nothing.
const VALID_CODE = generateMemberCode();

const affiliate = (overrides = {}) => ({
  memberCode: VALID_CODE,
  businessName: 'Panadería Tres Ríos',
  memberType: 'business',
  applicationStatus: 'approved',
  accountStatus: 'active',
  sector: { name: 'Alimentos y bebidas' },
  canton: { name: 'La Unión' },
  ...overrides,
});

const finding = (found) => async () => found;
const neverAsked = async () => {
  throw new Error('the database was queried for a code that could not exist');
};

test('a code that was never issued answers the same as no code at all', async () => {
  const code = generateMemberCode();

  assert.deepEqual(await verifyMemberCode({ code }, finding(null)), { valid: false });
});

// A mistyped code is settled by the check digit, so a slip of the finger never
// reaches the database at all.
test('a mistyped code is refused without a lookup', async () => {
  const code = generateMemberCode();
  const position = 2;
  const wrong = ALPHABET.split('').find((symbol) => symbol !== code[position]);
  const mistyped = code.slice(0, position) + wrong + code.slice(position + 1);

  assert.deepEqual(await verifyMemberCode({ code: mistyped }, neverAsked), { valid: false });
});

test('anything that is not a code is refused without a lookup', async () => {
  for (const code of [undefined, null, '', 'no es un codigo', { $ne: null }, 42, ['MA7K2Q4']]) {
    assert.deepEqual(await verifyMemberCode({ code }, neverAsked), { valid: false });
  }

  assert.deepEqual(await verifyMemberCode(null, neverAsked), { valid: false });
});

test('a code is read the way a person would write it down', async () => {
  const stored = affiliate();

  for (const written of [
    VALID_CODE,
    VALID_CODE.toLowerCase(),
    formatMemberCode(VALID_CODE),
    ` ${VALID_CODE} `,
  ]) {
    const answer = await verifyMemberCode({ code: written }, finding(stored));

    assert.equal(answer.valid, true, `${written} was not recognised`);
  }
});

test('an affiliate in good standing is named, grouped for reading aloud', async () => {
  const answer = await verifyMemberCode({ code: VALID_CODE }, finding(affiliate()));

  assert.deepEqual(answer, {
    valid: true,
    member: {
      memberCode: formatMemberCode(VALID_CODE),
      businessName: 'Panadería Tres Ríos',
      memberType: 'business',
      sector: 'Alimentos y bebidas',
      canton: 'La Unión',
    },
  });
});

// One answer for every reason a code does not stand. Telling them apart would
// let someone read the chamber's roll one code at a time.
test('a suspended or rejected account answers exactly like an unknown code', async () => {
  const unknown = await verifyMemberCode({ code: VALID_CODE }, finding(null));

  for (const overrides of [
    { accountStatus: 'suspended' },
    { applicationStatus: 'rejected' },
    { applicationStatus: 'pending_review' },
  ]) {
    assert.deepEqual(
      await verifyMemberCode({ code: VALID_CODE }, finding(affiliate(overrides))),
      unknown,
    );
  }
});

test('nothing belonging to the account escapes with the answer', async () => {
  const answer = await verifyMemberCode(
    { code: VALID_CODE },
    finding(
      affiliate({
        email: 'socio@example.cr',
        identificationNumber: '3101456789',
        phone: '88888888',
      }),
    ),
  );

  assert.deepEqual(Object.keys(answer.member).sort(), [
    'businessName',
    'canton',
    'memberCode',
    'memberType',
    'sector',
  ]);
});

test('an affiliate without a sector or canton still verifies', async () => {
  const answer = await verifyMemberCode(
    { code: VALID_CODE },
    finding(affiliate({ sector: null, canton: null })),
  );

  assert.equal(answer.valid, true);
  assert.equal(answer.member.sector, null);
});

const { readPublicProfile } = require('../../src/services/memberVerificationService');

// The whole document, as Mongo would hand it back, so the test sees everything
// a careless answer could carry.
const wholeDocument = (overrides = {}) => ({
  _id: '65f0c3a1b2c3d4e5f6a7b8c9',
  memberCode: VALID_CODE,
  businessName: 'Panadería Tres Ríos',
  businessDescription: 'Panadería artesanal.',
  memberType: 'business',
  location: 'Frente al parque',
  phone: '22791234',
  whatsappNumber: '87654321',
  website: 'https://panaderia.cr',
  logoUrl: 'https://cdn.example/logo.png',
  createdAt: new Date('2026-03-04T12:00:00.000Z'),
  applicationStatus: 'approved',
  accountStatus: 'active',
  sector: { name: 'Alimentos y bebidas' },
  canton: { name: 'La Unión', province: 'Cartago' },
  email: 'socio@example.cr',
  identificationType: 'legal_entity_id',
  identificationNumber: '3101456789',
  passwordHash: '$2b$12$notarealhash',
  statusReason: 'algo que un administrador escribió',
  reviewedBy: '65f0c3a1b2c3d4e5f6a7b8ca',
  reviewedAt: new Date(),
  ...overrides,
});

async function refused(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a code nobody was issued is not listed', async () => {
  assert.equal((await refused(() => readPublicProfile(VALID_CODE, finding(null)))).statusCode, 404);
});

test('a mistyped or malformed code never reaches the database', async () => {
  for (const code of [undefined, null, '', 'no es un codigo', { $ne: null }, 42, 'MZZZZZZ']) {
    assert.equal((await refused(() => readPublicProfile(code, neverAsked))).statusCode, 404);
  }
});

// Not listed and not in good standing answer the same, so the page cannot be
// used to learn that somebody was suspended.
test('a suspended or rejected affiliate has no public listing', async () => {
  for (const overrides of [
    { accountStatus: 'suspended' },
    { applicationStatus: 'rejected' },
    { applicationStatus: 'pending_review' },
  ]) {
    const error = await refused(() =>
      readPublicProfile(VALID_CODE, finding(wholeDocument(overrides))),
    );

    assert.equal(error.statusCode, 404);
    assert.match(error.message, /No affiliate is listed/);
  }
});

// The test the ticket asks for: read the raw answer, not the screen.
test('nothing administrative survives into the raw answer', async () => {
  const profile = await readPublicProfile(VALID_CODE, finding(wholeDocument()));
  const raw = JSON.stringify(profile);

  for (const secret of [
    'socio@example.cr',
    '3101456789',
    '$2b$12$notarealhash',
    'algo que un administrador escribió',
    '65f0c3a1b2c3d4e5f6a7b8ca',
    'approved',
    'legal_entity_id',
  ]) {
    assert.ok(!raw.includes(secret), `the answer carried ${secret}`);
  }

  for (const field of [
    'email',
    'identificationNumber',
    'identificationType',
    'passwordHash',
    'applicationStatus',
    'accountStatus',
    'statusReason',
    'reviewedBy',
    'reviewedAt',
    '_id',
  ]) {
    assert.equal(profile[field], undefined, `the answer carried ${field}`);
  }
});

test('the listing carries what a directory is for', async () => {
  const profile = await readPublicProfile(VALID_CODE, finding(wholeDocument()));

  assert.equal(profile.businessName, 'Panadería Tres Ríos');
  assert.equal(profile.memberCode, formatMemberCode(VALID_CODE));
  assert.equal(profile.sector, 'Alimentos y bebidas');
  assert.equal(profile.canton, 'La Unión');
  assert.equal(profile.province, 'Cartago');
  assert.equal(profile.phone, '22791234');
  assert.equal(profile.website, 'https://panaderia.cr');
});

test('an absent optional field is answered as nothing rather than left out', async () => {
  const profile = await readPublicProfile(
    VALID_CODE,
    finding(wholeDocument({ whatsappNumber: undefined, website: undefined, logoUrl: undefined })),
  );

  assert.equal(profile.whatsappNumber, null);
  assert.equal(profile.website, null);
  assert.equal(profile.logoUrl, null);
});

test('a code is found however a person wrote it down', async () => {
  for (const written of [
    VALID_CODE.toLowerCase(),
    formatMemberCode(VALID_CODE),
    ` ${VALID_CODE} `,
  ]) {
    const profile = await readPublicProfile(written, finding(wholeDocument()));

    assert.equal(profile.memberCode, formatMemberCode(VALID_CODE));
  }
});

test('a listing carrying a logo key answers with a signed address, not the key', async () => {
  const sign = async (key) => `https://storage.example/${key}?signed`;

  const profile = await readPublicProfile(
    VALID_CODE,
    finding(wholeDocument({ logoKey: 'member-logos/x/y.png' })),
    sign,
  );

  assert.equal(profile.logoUrl, 'https://storage.example/member-logos/x/y.png?signed');
});

test('a listing with no logo key falls back to the legacy text address', async () => {
  const profile = await readPublicProfile(VALID_CODE, finding(wholeDocument()));

  assert.equal(profile.logoUrl, 'https://cdn.example/logo.png');
});
