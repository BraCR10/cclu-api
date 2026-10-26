const { REQUIRED_ENVIRONMENT_VARIABLES: STORAGE_VARIABLES } = require('./fileStorage');
const { REQUIRED_VARIABLES: MAIL_VARIABLES } = require('./mailer');

const ALWAYS_REQUIRED = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'WEB_ORIGIN',
  'COOKIE_SECURE',
];

// Unset reads as development, which is what a machine without the variable is.
// Anything else has to be one of these: a misspelt "prod" would otherwise turn
// off every production rule below without a word.
const ENVIRONMENTS = Object.freeze(['development', 'test', 'production']);

function missingFrom(names, environment) {
  return names.filter((name) => {
    const value = environment[name];

    return typeof value !== 'string' || value.trim() === '';
  });
}

// What a deployed server cannot run without. Receipts written to its own disk
// are lost on the next deploy, a panel without mail cannot invite or reset
// anybody, and a session cookie sent without TLS can be read on the way.
function productionProblems(environment) {
  const problems = [];
  const missingStorage = missingFrom(STORAGE_VARIABLES, environment);
  const missingMail = missingFrom(MAIL_VARIABLES, environment);

  if (missingStorage.length > 0) {
    problems.push(`Production stores files in the buckets. Set ${missingStorage.join(', ')}.`);
  }

  if (missingMail.length > 0) {
    problems.push(`Production sends mail. Set ${missingMail.join(', ')}.`);
  }

  if (environment.COOKIE_SECURE !== 'true') {
    problems.push('Production sends the session cookie over HTTPS only. Set COOKIE_SECURE=true.');
  }

  return problems;
}

// Every problem at once, so a deploy is fixed in one pass rather than one
// restart per variable.
function findEnvironmentProblems(environment = process.env) {
  const problems = [];
  const missing = missingFrom(ALWAYS_REQUIRED, environment);
  const nodeEnv = environment.NODE_ENV ?? 'development';

  if (missing.length > 0) {
    problems.push(`Missing environment variables: ${missing.join(', ')}.`);
  }

  if (!ENVIRONMENTS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of ${ENVIRONMENTS.join(', ')}, not "${nodeEnv}".`);
  }

  if (nodeEnv === 'production') {
    problems.push(...productionProblems(environment));
  }

  return problems;
}

module.exports = { findEnvironmentProblems, ENVIRONMENTS };
