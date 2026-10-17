const { ValidationError } = require('./memberRules');
const { ERROR_CODES } = require('./errorCodes');

const DEFAULT_PAGE_SIZE = 10;
const MAXIMUM_PAGE_SIZE = 50;
// Far past any list the chamber will hold, and low enough that the items to
// skip stay an exact integer instead of overflowing into an approximation.
const MAXIMUM_PAGE = 100_000;

const WHOLE_NUMBER = /^[1-9]\d*$/;

// Absent means the default. Anything else has to be plain digits in range: a
// typo, a repeated parameter, hexadecimal or an exponent is refused instead of
// being read as some other page.
function readPositiveInteger(query, field, fallback, maximum) {
  const raw = query?.[field];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = typeof raw === 'string' && WHOLE_NUMBER.test(raw) ? Number(raw) : Number.NaN;

  if (!(value >= 1 && value <= maximum)) {
    throw new ValidationError(
      ERROR_CODES.INVALID_FORMAT,
      field,
      `${field} is a whole number from 1 to ${maximum}.`,
    );
  }

  return value;
}

function readPagination(query) {
  const page = readPositiveInteger(query, 'page', 1, MAXIMUM_PAGE);
  const pageSize = readPositiveInteger(query, 'pageSize', DEFAULT_PAGE_SIZE, MAXIMUM_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize };
}

// Every list answers in this shape, so a screen pages any of them the same way.
function paginated(items, total, { page, pageSize }) {
  return { items, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}

module.exports = { DEFAULT_PAGE_SIZE, MAXIMUM_PAGE_SIZE, MAXIMUM_PAGE, readPagination, paginated };
