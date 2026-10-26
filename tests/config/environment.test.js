const test = require('node:test');
const assert = require('node:assert/strict');
const { findEnvironmentProblems } = require('../../src/config/environment');
const { REQUIRED_ENVIRONMENT_VARIABLES } = require('../../src/config/fileStorage');
const { REQUIRED_VARIABLES } = require('../../src/config/mailer');

const BASE = {
  MONGODB_URI: 'mongodb://localhost/cclu',
  JWT_SECRET: 'secret',
  JWT_EXPIRES_IN: '1h',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECURE: 'false',
};

const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  ...Object.fromEntries(REQUIRED_ENVIRONMENT_VARIABLES.map((name) => [name, 'set'])),
  ...Object.fromEntries(REQUIRED_VARIABLES.map((name) => [name, 'set'])),
};

test('a development machine starts with only the core variables', () => {
  assert.deepEqual(findEnvironmentProblems(BASE), []);
  assert.deepEqual(findEnvironmentProblems({ ...BASE, NODE_ENV: 'development' }), []);
});

test('a missing or blank core variable is named', () => {
  const [problem] = findEnvironmentProblems({ ...BASE, JWT_SECRET: '  ', WEB_ORIGIN: undefined });

  assert.match(problem, /JWT_SECRET, WEB_ORIGIN/);
});

test('a misspelt NODE_ENV is refused rather than read as development', () => {
  assert.match(findEnvironmentProblems({ ...BASE, NODE_ENV: 'prod' }).join(), /NODE_ENV/);
});

test('a production server with everything set starts', () => {
  assert.deepEqual(findEnvironmentProblems(PRODUCTION), []);
});

test('production refuses to start without its buckets, its mail or a secure cookie', () => {
  const problems = findEnvironmentProblems({
    ...PRODUCTION,
    S3_PRIVATE_BUCKET: '',
    SMTP_HOST: undefined,
    COOKIE_SECURE: 'false',
  });

  assert.equal(problems.length, 3);
  assert.match(problems[0], /S3_PRIVATE_BUCKET/);
  assert.match(problems[1], /SMTP_HOST/);
  assert.match(problems[2], /COOKIE_SECURE=true/);
});
