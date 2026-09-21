const { CODES, refuse, PATTERNS } = require('./memberRules');

// Shared by every module where a member publishes their own content — a job
// posting, a marketplace listing — so the same three rules are not rewritten
// per module: required text has a shape, optional text sent empty is a
// removal, and neither ever reaches a query as anything but a string.

function readRequiredText(body, field, maxLength) {
  const value = body[field];

  if (typeof value !== 'string' || value.trim() === '') {
    refuse(CODES.REQUIRED, field, `The field ${field} is required.`);
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    refuse(CODES.TOO_LONG, field, `The field ${field} is longer than ${maxLength}.`);
  }

  return trimmed;
}

function readOptionalText(body, field, maxLength, pattern) {
  const value = body[field];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    refuse(CODES.NOT_TEXT, field, `The field ${field} must be text.`);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    refuse(CODES.TOO_LONG, field, `The field ${field} is longer than ${maxLength}.`);
  }

  if (pattern !== undefined && !PATTERNS[pattern].test(trimmed)) {
    refuse(CODES.INVALID_FORMAT, field, `The field ${field} is not in the expected format.`);
  }

  return trimmed;
}

function requireBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The request body is missing.');
  }

  return body;
}

module.exports = { readRequiredText, readOptionalText, requireBody };
