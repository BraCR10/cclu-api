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
