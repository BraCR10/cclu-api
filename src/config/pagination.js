const { ValidationError } = require('./memberRules');
const { ERROR_CODES } = require('./errorCodes');

const DEFAULT_PAGE_SIZE = 10;
const MAXIMUM_PAGE_SIZE = 50;

// Absent means the default. Anything else has to be a whole number in range,
// so a typo is refused instead of quietly answering the first page.
function readPositiveInteger(query, field, fallback, maximum) {
  const raw = query?.[field];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new ValidationError(
      ERROR_CODES.INVALID_FORMAT,
      field,
      `${field} is a whole number from 1 to ${maximum}.`,
    );
  }

  return value;
}

function readPagination(query) {
  const page = readPositiveInteger(query, 'page', 1, Number.MAX_SAFE_INTEGER);
  const pageSize = readPositiveInteger(query, 'pageSize', DEFAULT_PAGE_SIZE, MAXIMUM_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize };
}

// Every list answers in this shape, so a screen pages any of them the same way.
function paginated(items, total, { page, pageSize }) {
  return { items, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}

module.exports = { DEFAULT_PAGE_SIZE, MAXIMUM_PAGE_SIZE, readPagination, paginated };
