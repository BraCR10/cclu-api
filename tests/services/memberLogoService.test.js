const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadLogo, deleteLogo } = require('../../src/services/memberLogoService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const NEW_KEY = 'member-logos/65f0c3a1b2c3d4e5f6a7b8c9/newkey.png';
const OLD_KEY = 'member-logos/65f0c3a1b2c3d4e5f6a7b8c9/oldkey.png';
const SIGNED_URL = 'https://storage.example/signed-for-a-short-while';

const finding = (member) => async () => member;
const neverAsked = async () => {
  throw new Error('the database was reached for an account that could not exist');
};

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('uploading a first logo stores the new key and signs an address for it', async () => {
  const saved = [];
  const removed = [];
  const answer = await uploadLogo(
    MEMBER_ID,
    { contentType: 'image/png', content: 'ignored-by-the-fake' },
    finding({ logoKey: undefined }),
    async () => ({ key: NEW_KEY }),
    async (id, key) => saved.push({ id, key }),
    async (key) => removed.push(key),
    async (key) => (key === NEW_KEY ? SIGNED_URL : null),
  );

  assert.deepEqual(answer, { logoUrl: SIGNED_URL });
  assert.deepEqual(saved, [{ id: MEMBER_ID, key: NEW_KEY }]);
  assert.equal(removed.length, 0);
});

test('replacing a logo removes the old object only after the new one is saved', async () => {
  const order = [];
  await uploadLogo(
    MEMBER_ID,
    { contentType: 'image/png', content: 'ignored-by-the-fake' },
    finding({ logoKey: OLD_KEY }),
    async () => ({ key: NEW_KEY }),
    async () => order.push('saved'),
    async () => order.push('removed'),
    async () => SIGNED_URL,
  );

  assert.deepEqual(order, ['saved', 'removed']);
});

test('uploading for an account that no longer exists is a not found, and nothing is stored', async () => {
  const upload = async () => {
    throw new Error('the upload was called for an account that does not exist');
  };

  const error = await refusal(() =>
    uploadLogo(MEMBER_ID, { contentType: 'image/png', content: 'x' }, finding(null), upload),
  );

  assert.equal(error.statusCode, 404);
});

test('deleting a logo removes the stored object and clears the reference', async () => {
  const removed = [];
  const cleared = [];

  await deleteLogo(
    MEMBER_ID,
    finding({ logoKey: OLD_KEY }),
    async (key) => removed.push(key),
    async (id) => cleared.push(id),
  );

  assert.deepEqual(removed, [OLD_KEY]);
  assert.deepEqual(cleared, [MEMBER_ID]);
});

test('deleting when there is no logo touches neither storage nor the account', async () => {
  const removed = [];
  const clear = async () => {
    throw new Error('clear was called with nothing to clear');
  };

  await deleteLogo(
    MEMBER_ID,
    finding({ logoKey: undefined }),
    async (key) => removed.push(key),
    clear,
  );

  assert.equal(removed.length, 0);
});

test('deleting for an account that no longer exists is a not found', async () => {
  const error = await refusal(() => deleteLogo(MEMBER_ID, finding(null), neverAsked));

  assert.equal(error.statusCode, 404);
});
