const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { issueToken, verifyToken } = require('../../src/services/tokenService');
const { ROLES } = require('../../src/config/roles');

const SECRET = 'secret-for-tests';
const OTHER_SECRET = 'another-secret-for-tests';
const IDENTITY = { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.MEMBER };

test('verifyToken returns the identity issueToken was given', () => {
  const token = issueToken(IDENTITY, SECRET, '1h');

  assert.deepEqual(verifyToken(token, SECRET), IDENTITY);
});

test('issueToken accepts an identifier that is not a string', () => {
  const token = issueToken({ id: { toString: () => 'abc123' }, role: ROLES.ADMIN }, SECRET, '1h');

  assert.equal(verifyToken(token, SECRET).id, 'abc123');
});

test('issueToken puts nothing in the payload beyond the subject and the role', () => {
  const token = issueToken(IDENTITY, SECRET, '1h');
  const payload = jwt.decode(token);

  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'role', 'sub']);
});

test('verifyToken rejects a token signed with a different secret', () => {
  const token = issueToken(IDENTITY, OTHER_SECRET, '1h');

  assert.throws(() => verifyToken(token, SECRET));
});

test('verifyToken rejects a token whose payload was edited', () => {
  const token = issueToken(IDENTITY, SECRET, '1h');
  const [header, , signature] = token.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ sub: IDENTITY.id, role: ROLES.ADMIN }),
  ).toString('base64url');

  assert.throws(() => verifyToken(`${header}.${forgedPayload}.${signature}`, SECRET));
});

test('issueToken names the algorithm in the header instead of leaving it to a default', () => {
  const token = issueToken(IDENTITY, SECRET, '1h');
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());

  assert.equal(header.alg, 'HS256');
});

test('verifyToken rejects a token that asks for no signature at all', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: IDENTITY.id, role: ROLES.ADMIN })).toString(
    'base64url',
  );

  assert.throws(() => verifyToken(`${header}.${payload}.`, SECRET));
});

test('verifyToken rejects a token signed with an algorithm this API does not use', () => {
  const token = jwt.sign({ role: ROLES.ADMIN }, SECRET, {
    algorithm: 'HS512',
    subject: IDENTITY.id,
    expiresIn: '1h',
  });

  assert.throws(() => verifyToken(token, SECRET));
});

test('verifyToken rejects a token that has expired', () => {
  const token = issueToken(IDENTITY, SECRET, '-1s');

  assert.throws(() => verifyToken(token, SECRET));
});
