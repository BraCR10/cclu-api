const test = require('node:test');
const assert = require('node:assert/strict');
const { readCookies, parseCookieHeader } = require('../../src/middlewares/readCookies');

test('parseCookieHeader reads every pair a browser sends', () => {
  assert.deepEqual(parseCookieHeader('cclu_session=abc; theme=dark'), {
    cclu_session: 'abc',
    theme: 'dark',
  });
});

test('parseCookieHeader tolerates the spacing browsers actually use', () => {
  assert.deepEqual(parseCookieHeader('a=1;b=2'), { a: '1', b: '2' });
  assert.deepEqual(parseCookieHeader('  a=1 ;  b=2  '), { a: '1', b: '2' });
});

test('parseCookieHeader keeps a value that contains an equals sign intact', () => {
  assert.deepEqual(parseCookieHeader('token=abc=def=='), { token: 'abc=def==' });
});

test('parseCookieHeader decodes an encoded value and survives a broken one', () => {
  assert.deepEqual(parseCookieHeader('name=a%20b'), { name: 'a b' });
  assert.deepEqual(parseCookieHeader('name=%E0%A4%A'), { name: '%E0%A4%A' });
});

test('parseCookieHeader keeps the first of two cookies sharing a name', () => {
  assert.deepEqual(parseCookieHeader('a=first; a=second'), { a: 'first' });
});

test('parseCookieHeader returns nothing rather than failing on a header it cannot read', () => {
  assert.deepEqual(parseCookieHeader(undefined), {});
  assert.deepEqual(parseCookieHeader(''), {});
  assert.deepEqual(parseCookieHeader('novalue'), {});
  assert.deepEqual(parseCookieHeader('=orphan'), {});
  assert.deepEqual(parseCookieHeader(';;;'), {});
});

test('readCookies leaves an empty object on a request that carries no cookies', () => {
  const request = { headers: {} };

  readCookies(request, {}, () => {});

  assert.deepEqual(request.cookies, {});
});

test('readCookies attaches the parsed cookies and continues', () => {
  const request = { headers: { cookie: 'cclu_session=abc' } };
  let continued = false;

  readCookies(request, {}, () => {
    continued = true;
  });

  assert.deepEqual(request.cookies, { cclu_session: 'abc' });
  assert.equal(continued, true);
});
