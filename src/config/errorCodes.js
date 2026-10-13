// Kept as JSON so cclu-web can copy the exact list its error catalog is tested
// against. docs/conventions.md describes the contract.
const ERROR_CODES = Object.freeze({ ...require('./errorCodes.json') });

const REGISTERED_CODES = new Set(Object.values(ERROR_CODES));

function isRegisteredCode(code) {
  return REGISTERED_CODES.has(code);
}

class ApplicationError extends Error {
  constructor(code, message, { statusCode = 400, field = null, reason, name } = {}) {
    if (!isRegisteredCode(code)) {
      throw new TypeError(`The error code ${code} is not in src/config/errorCodes.json.`);
    }

    super(message);
    this.name = name ?? 'ApplicationError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;

    if (reason !== undefined) {
      this.reason = reason;
    }
  }
}

module.exports = { ERROR_CODES, ApplicationError, isRegisteredCode };
