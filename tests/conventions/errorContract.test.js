const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const { ERROR_CODES } = require('../../src/config/errorCodes');

const SOURCE = join(__dirname, '..', '..', 'src');
const REGISTERED = new Set(Object.values(ERROR_CODES));

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);

    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}

// An error assembled by hand is one the registry never sees, and a client then
// receives a status with no code to decide on.
test('no source file assembles an error by setting its status by hand', () => {
  const offenders = sourceFiles(SOURCE)
    .filter((path) => /\berror\.statusCode\s*=/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(SOURCE, path));

  assert.deepEqual(offenders, []);
});

test('every code written into a JSON answer is registered', () => {
  const unregistered = sourceFiles(SOURCE).flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(/\bcode: '([a-z_]+)'/g)]
      .map((match) => match[1])
      .filter((code) => !REGISTERED.has(code))
      .map((code) => `${relative(SOURCE, path)}: ${code}`),
  );

  assert.deepEqual(unregistered, []);
});
