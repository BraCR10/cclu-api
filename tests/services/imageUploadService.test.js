const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadImage, decodeBase64 } = require('../../src/services/imageUploadService');
const { FILE_PURPOSES } = require('../../src/config/fileStorage');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const CONTENT = Buffer.from('the bytes of a logo');
const ENCODED = CONTENT.toString('base64');

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('base64 text decodes to the exact bytes it was encoded from', () => {
  assert.deepEqual(decodeBase64(ENCODED), CONTENT);
});

test('a data URL prefix is stripped before decoding', () => {
  assert.deepEqual(decodeBase64(`data:image/png;base64,${ENCODED}`), CONTENT);
});

test('text that is not base64 is refused rather than mangled into bytes', async () => {
  for (const value of ['not base64 at all!!', ENCODED.slice(0, -1), '', '   ']) {
    const error = await refusal(() => decodeBase64(value));

    assert.equal(error.name, 'FileStorageError');
    assert.equal(error.statusCode, 400);
  }
});

test('a missing content field is refused before anything is uploaded', async () => {
  for (const base64 of [undefined, null, 42]) {
    const error = await refusal(() => decodeBase64(base64));

    assert.equal(error.statusCode, 400);
  }
});

test('a decoded upload reaches fileStorageService as a Buffer, and nothing else changes', async () => {
  const calls = [];
  const fakeUpload = async (upload) => {
    calls.push(upload);
    return { key: 'member-logos/x/y.png' };
  };

  const answer = await uploadImage(
    {
      purpose: FILE_PURPOSES.MEMBER_LOGO,
      ownerId: MEMBER_ID,
      contentType: 'image/png',
      base64: ENCODED,
    },
    fakeUpload,
  );

  assert.deepEqual(answer, { key: 'member-logos/x/y.png' });
  assert.equal(calls.length, 1);
  assert.equal(Buffer.isBuffer(calls[0].content), true);
  assert.deepEqual(calls[0].content, CONTENT);
  assert.equal(calls[0].purpose, FILE_PURPOSES.MEMBER_LOGO);
  assert.equal(calls[0].ownerId, MEMBER_ID);
  assert.equal(calls[0].contentType, 'image/png');
});
