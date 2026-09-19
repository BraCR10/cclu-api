const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateMemberCode,
  normalizeMemberCode,
  isMemberCodeValid,
  formatMemberCode,
  ALPHABET,
} = require('../../src/services/memberCodeService');

const FIELD_SIZE = 32;

test('the alphabet leaves out the letters that are misread when spoken', () => {
  assert.equal(ALPHABET.length, FIELD_SIZE);
  for (const letter of ['I', 'L', 'O', 'U']) {
    assert.ok(!ALPHABET.includes(letter), `${letter} should not be in the alphabet`);
  }
});

test('a generated code is valid and shaped as agreed', () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = generateMemberCode();

    assert.match(code, /^M[0-9A-HJKMNP-TV-Z]{6}$/);
    assert.equal(isMemberCodeValid(code), true);
  }
});

test('no two codes come out the same across many draws', () => {
  const seen = new Set();

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    seen.add(generateMemberCode());
  }

  assert.ok(seen.size > 1990, `only ${seen.size} distinct codes in 2000 draws`);
});

test('every single character error is detected', () => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const code = generateMemberCode();

    for (let position = 1; position < code.length; position += 1) {
      for (const replacement of ALPHABET) {
        if (replacement === code[position]) {
          continue;
        }

        const mistyped = code.slice(0, position) + replacement + code.slice(position + 1);

        assert.equal(isMemberCodeValid(mistyped), false, `${mistyped} passed as valid`);
      }
    }
  }
});

test('every transposition of neighbouring characters is detected', () => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = generateMemberCode();

    for (let position = 1; position < code.length - 1; position += 1) {
      if (code[position] === code[position + 1]) {
        continue;
      }

      const swapped =
        code.slice(0, position) + code[position + 1] + code[position] + code.slice(position + 2);

      assert.equal(isMemberCodeValid(swapped), false, `${swapped} passed as valid`);
    }
  }
});

test('a code is read the way a person writes it', () => {
  const code = generateMemberCode();

  assert.equal(normalizeMemberCode(code.toLowerCase()), code);
  assert.equal(normalizeMemberCode(formatMemberCode(code)), code);
  assert.equal(normalizeMemberCode(` ${code} `), code);
});

test('the letters Crockford reads as digits are accepted as those digits', () => {
  const withZero = 'M0ABCD';
  const asLetter = normalizeMemberCode(`${withZero}1`.replace('0', 'O').replace(/1$/, 'I'));

  assert.equal(asLetter, 'M0ABCD1');
  assert.equal(normalizeMemberCode('ML2345'), null);
});

test('anything that is not a code is refused rather than guessed at', () => {
  assert.equal(normalizeMemberCode(undefined), null);
  assert.equal(normalizeMemberCode(''), null);
  assert.equal(normalizeMemberCode('A123456'), null);
  assert.equal(normalizeMemberCode('M12345'), null);
  assert.equal(normalizeMemberCode('M1234567'), null);
  assert.equal(isMemberCodeValid('no es un codigo'), false);
});

test('a code is shown grouped and stored ungrouped', () => {
  assert.equal(formatMemberCode('MA7K2Q4'), 'M-A7K2-Q4');
  assert.equal(normalizeMemberCode('M-A7K2-Q4'), 'MA7K2Q4');
});
