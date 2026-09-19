const { randomInt } = require('node:crypto');

// Crockford Base32, which leaves out I, L, O and U so that nothing is misread
// when a code is spoken over a counter or a telephone.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'M';
const RANDOM_LENGTH = 5;
const FIELD_SIZE = 32;

// Damm needs a quasigroup that is totally anti-symmetric. This one is built
// rather than tabulated: a * b = (2 x a) XOR b over GF(2^5).
const IRREDUCIBLE = 0b100101;

function multiplyInField(a, b) {
  let left = a;
  let right = b;
  let product = 0;

  while (right > 0) {
    if ((right & 1) === 1) {
      product ^= left;
    }

    left <<= 1;

    if ((left & FIELD_SIZE) !== 0) {
      left ^= IRREDUCIBLE;
    }

    right >>= 1;
  }

  return product;
}

function combine(interim, symbol) {
  return multiplyInField(2, interim) ^ symbol;
}

// The quasigroup is a Latin square, so exactly one symbol closes any state.
function checkSymbolFor(symbols) {
  const interim = symbols.reduce(combine, 0);

  for (let candidate = 0; candidate < FIELD_SIZE; candidate += 1) {
    if (combine(interim, candidate) === 0) {
      return candidate;
    }
  }

  throw new Error('The quasigroup has no closing symbol, which cannot happen.');
}

function generateMemberCode(randomSymbol = () => randomInt(FIELD_SIZE)) {
  const symbols = Array.from({ length: RANDOM_LENGTH }, randomSymbol);
  const withCheck = [...symbols, checkSymbolFor(symbols)];

  return PREFIX + withCheck.map((symbol) => ALPHABET[symbol]).join('');
}

// Read the way a person would write it: any case, with or without the grouping
// hyphens, and with the letters Crockford says stand for digits.
function normalizeMemberCode(code) {
  if (typeof code !== 'string') {
    return null;
  }

  const cleaned = code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

  if (!new RegExp(`^${PREFIX}[${ALPHABET}]{${RANDOM_LENGTH + 1}}$`).test(cleaned)) {
    return null;
  }

  return cleaned;
}

function isMemberCodeValid(code) {
  const normalized = normalizeMemberCode(code);

  if (normalized === null) {
    return false;
  }

  const symbols = [...normalized.slice(PREFIX.length)].map((character) =>
    ALPHABET.indexOf(character),
  );

  return symbols.reduce(combine, 0) === 0;
}

// Shown grouped, never stored that way.
function formatMemberCode(code) {
  const normalized = normalizeMemberCode(code);

  if (normalized === null) {
    return code;
  }

  return `${normalized.slice(0, 1)}-${normalized.slice(1, 5)}-${normalized.slice(5)}`;
}

module.exports = {
  generateMemberCode,
  normalizeMemberCode,
  isMemberCodeValid,
  formatMemberCode,
  ALPHABET,
};
