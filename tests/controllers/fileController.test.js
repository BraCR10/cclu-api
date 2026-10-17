const test = require('node:test');
const assert = require('node:assert/strict');
const {
  openPublicFile,
  openFileAsAdmin,
  uploadFile,
} = require('../../src/controllers/fileController');

const OWNER = '65f0c3a1b2c3d4e5f6a7b8c9';
const NAME = '0123456789abcdef0123456789abcdef';
const RECEIPT = `payment-receipts/${OWNER}/${NAME}.png`;
const CERTIFICATION = `membership-certifications/${OWNER}/${NAME}.pdf`;
const LOGO = `member-logos/${OWNER}/${NAME}.png`;

function recordingResponse() {
  const headers = {};
  const sent = [];

  return {
    headers,
    sent,
    status() {
      return this;
    },
    json(body) {
      sent.push(body);
    },
    set(name, value) {
      headers[name] = value;
    },
    send(body) {
      sent.push(body);
    },
  };
}

test('a receipt or a certification is never served without a session', async () => {
  for (const key of [RECEIPT, CERTIFICATION, 'not/a/key', '../../etc/passwd']) {
    let read = false;

    await assert.rejects(
      openPublicFile(
        { params: { key } },
        recordingResponse(),
        () => {},
        async () => {
          read = true;
        },
      ),
      { statusCode: 404 },
    );
    assert.equal(read, false, key);
  }
});

test('a public file leaves with headers that keep the browser from running it', async () => {
  const response = recordingResponse();

  await openPublicFile(
    { params: { key: LOGO } },
    response,
    () => {},
    async () => Buffer.from('x'),
  );

  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(response.headers['Content-Security-Policy'], /sandbox/);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
});

test('an administrator opens a private file through the panel', async () => {
  const response = recordingResponse();

  await openFileAsAdmin(
    { params: { key: CERTIFICATION } },
    response,
    () => {},
    async () => Buffer.from('%PDF-'),
  );

  assert.equal(response.headers['Content-Type'], 'application/pdf');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
});

test('the route open to people without an account cannot store a receipt', async () => {
  const allowed = [];

  await uploadFile(
    { body: { purpose: 'member-logos', ownerId: OWNER }, file: {} },
    recordingResponse(),
    () => {},
    async (upload, store, name, purposes) => {
      allowed.push(...purposes);
      return { key: LOGO };
    },
  );

  assert.deepEqual(allowed.sort(), ['member-logos', 'membership-certifications']);
});

test('a PDF is served without the sandbox the browser viewer cannot render under', async () => {
  const response = recordingResponse();

  await openFileAsAdmin(
    { params: { key: CERTIFICATION } },
    response,
    () => {},
    async () => Buffer.from('%PDF-'),
  );

  assert.equal(response.headers['Content-Security-Policy'], undefined);
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['Content-Type'], 'application/pdf');
});
