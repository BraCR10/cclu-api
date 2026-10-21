const { refuse } = require('./memberRules');
const { ERROR_CODES } = require('./errorCodes');

const MAXIMUM_SEARCH_LENGTH = 100;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

// A search is matched as typed. Escaping keeps a dot or a bracket from turning
// into a pattern, and from making a slow one.
function escapeForRegex(text) {
  return text.replace(REGEX_SPECIALS, '\\$&');
}

// The text a list is searched by, or null for no search. Blank counts as none.
function readSearch(query) {
  const raw = query?.search;

  if (raw === undefined) {
    return null;
  }

  if (typeof raw !== 'string') {
    refuse(ERROR_CODES.NOT_TEXT, 'search', 'The search is text.');
  }

  const text = raw.trim();

  if (text.length > MAXIMUM_SEARCH_LENGTH) {
    refuse(
      ERROR_CODES.TOO_LONG,
      'search',
      `The search is at most ${MAXIMUM_SEARCH_LENGTH} characters.`,
    );
  }

  return text === '' ? null : text;
}

module.exports = { MAXIMUM_SEARCH_LENGTH, escapeForRegex, readSearch };
