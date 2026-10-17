const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PAGE_SIZE,
  MAXIMUM_PAGE_SIZE,
  MAXIMUM_PAGE,
  readPagination,
  paginated,
} = require('../../src/config/pagination');
const { ERROR_CODES } = require('../../src/config/errorCodes');

test('a list without page parameters answers the first page at the default size', () => {
  assert.deepEqual(readPagination({}), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 });
  assert.deepEqual(readPagination(undefined), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 });
});

test('the page and its size decide how many items are skipped', () => {
  assert.deepEqual(readPagination({ page: '3', pageSize: '20' }), {
    page: 3,
    pageSize: 20,
    skip: 40,
  });
});

// A typo answering the first page would look like data that disappeared.
test('a page or size that is not a whole number in range is refused by name', () => {
  for (const [query, field] of [
    [{ page: '0' }, 'page'],
    [{ page: '-1' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ page: 'two' }, 'page'],
    [{ page: '0x10' }, 'page'],
    [{ page: '1e3' }, 'page'],
    [{ page: ' 5 ' }, 'page'],
    [{ page: '05' }, 'page'],
    [{ page: ['7'] }, 'page'],
    [{ page: ['1', '2'] }, 'page'],
    [{ pageSize: '0b11' }, 'pageSize'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: String(MAXIMUM_PAGE_SIZE + 1) }, 'pageSize'],
  ]) {
    assert.throws(
      () => readPagination(query),
      (error) => error.code === ERROR_CODES.INVALID_FORMAT && error.field === field,
    );
  }
});

test('the answer says how many pages exist', () => {
  assert.deepEqual(paginated(['a'], 21, { page: 3, pageSize: 10 }), {
    items: ['a'],
    page: 3,
    pageSize: 10,
    total: 21,
    pageCount: 3,
  });
  assert.equal(paginated([], 0, { page: 1, pageSize: 10 }).pageCount, 0);
});

// A page past the ceiling would ask the database to skip a number too large to
// be represented exactly.
test('the last page allowed still skips an exact number of items', () => {
  const { skip } = readPagination({
    page: String(MAXIMUM_PAGE),
    pageSize: String(MAXIMUM_PAGE_SIZE),
  });

  assert.equal(Number.isSafeInteger(skip), true);
  assert.throws(
    () => readPagination({ page: String(MAXIMUM_PAGE + 1) }),
    (error) => error.code === ERROR_CODES.INVALID_FORMAT && error.field === 'page',
  );
});
