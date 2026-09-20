const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['src', 'scripts', 'tests', '.env.example'];
const SKIPPED = new Set(['node_modules', '.git', 'coverage']);
const EXTENSIONS = ['.js', '.mjs', '.cjs', '.example'];

// Function words that carry no meaning in English, so finding one in a comment
// means the comment is not in English. Proper nouns the chamber uses, such as
// La Unión or cantón, contain none of them and are left alone.
const SPANISH_MARKERS = [
  'que',
  'para',
  'los',
  'las',
  'con',
  'por',
  'una',
  'del',
  'cuando',
  'donde',
  'desde',
  'entre',
  'sobre',
  'pero',
  'como',
  'este',
  'esta',
  'cada',
  'debe',
  'hace',
];

const COMMENT = /^\s*(\/\/|\*|\/\*|#)/;
const SELF = relative(ROOT, __filename);

function filesUnder(entry) {
  const path = join(ROOT, entry);
  const found = [];

  const walk = (current) => {
    const stats = statSync(current);

    if (stats.isFile()) {
      if (EXTENSIONS.some((extension) => current.endsWith(extension))) {
        found.push(current);
      }

      return;
    }

    for (const name of readdirSync(current)) {
      if (!SKIPPED.has(name)) {
        walk(join(current, name));
      }
    }
  };

  walk(path);

  return found;
}

function spanishCommentsIn(file) {
  const pattern = new RegExp(`\\b(${SPANISH_MARKERS.join('|')})\\b`, 'i');

  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => COMMENT.test(line) && pattern.test(line))
    .map(({ line, number }) => `${relative(ROOT, file)}:${number} ${line.trim()}`);
}

// Identifiers, stored values and comments are English; only what a person reads
// on a screen or in a message is Spanish. A comment is neither.
test('every comment is written in English', () => {
  const offenders = SCANNED.flatMap(filesUnder)
    .filter((file) => relative(ROOT, file) !== SELF)
    .flatMap(spanishCommentsIn);

  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`);
});
