const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uploadFile,
  createDownloadUrl,
  deleteFile,
} = require('../../src/services/fileStorageService');
const {
  REQUIRED_ENVIRONMENT_VARIABLES,
  FILE_PURPOSES,
  MAXIMUM_FILE_SIZE_BYTES,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS,
  readFileStorageConfiguration,
} = require('../../src/config/fileStorage');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ANOTHER_MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const OBJECT_NAME = '0123456789abcdef0123456789abcdef';
const SIGNED_URL = 'https://storage.example/signed-for-a-short-while';

const fixedObjectName = () => OBJECT_NAME;

function recordingStore() {
  const stored = [];
  const signed = [];
  const removed = [];

  return {
    stored,
    signed,
    removed,
    store: {
      putObject: async (request) => {
        stored.push(request);
      },
      createSignedDownloadUrl: async (request) => {
        signed.push(request);
        return SIGNED_URL;
      },
      deleteObject: async (request) => {
        removed.push(request);
      },
    },
  };
}

function validUpload(overrides = {}) {
  return {
    purpose: FILE_PURPOSES.PAYMENT_RECEIPT,
    ownerId: MEMBER_ID,
    contentType: 'image/png',
    content: Buffer.from('the bytes of a receipt'),
    fileName: 'comprobante.png',
    ...overrides,
  };
}

function storedKey(purpose = FILE_PURPOSES.PAYMENT_RECEIPT, ownerId = MEMBER_ID) {
  return `${purpose}/${ownerId}/${OBJECT_NAME}.png`;
}

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('an upload answers with the stored key and nothing that can be opened', async () => {
  const { store } = recordingStore();

  const answer = await uploadFile(validUpload(), store, fixedObjectName);

  assert.deepEqual(Object.keys(answer), ['key']);
  assert.equal(answer.key.startsWith('http'), false);
});

test('a key is namespaced by purpose and by the member it belongs to', async () => {
  const { store } = recordingStore();

  const receipt = await uploadFile(validUpload(), store, fixedObjectName);
  const logo = await uploadFile(
    validUpload({ purpose: FILE_PURPOSES.MEMBER_LOGO, ownerId: ANOTHER_MEMBER_ID }),
    store,
    fixedObjectName,
  );

  assert.equal(receipt.key, `${FILE_PURPOSES.PAYMENT_RECEIPT}/${MEMBER_ID}/${OBJECT_NAME}.png`);
  assert.equal(logo.key, `${FILE_PURPOSES.MEMBER_LOGO}/${ANOTHER_MEMBER_ID}/${OBJECT_NAME}.png`);
});

test('two uploads of the same file under the same name never share a key', async () => {
  const { store, stored } = recordingStore();

  const first = await uploadFile(validUpload(), store);
  const second = await uploadFile(validUpload(), store);

  assert.notEqual(first.key, second.key);
  assert.equal(stored.length, 2);
  assert.notEqual(stored[0].key, stored[1].key);
});

test('the extension comes from the content type and never from the name that was sent', async () => {
  const { store } = recordingStore();

  const { key } = await uploadFile(
    validUpload({ contentType: 'application/pdf', fileName: 'comprobante.png.exe' }),
    store,
    fixedObjectName,
  );

  assert.equal(key.endsWith('.pdf'), true);
  assert.equal(key.includes('comprobante'), false);
  assert.equal(key.includes('exe'), false);
});

test('nothing but the key, the bytes and the content type reaches the storage', async () => {
  const { store, stored } = recordingStore();
  const upload = validUpload();

  await uploadFile(upload, store, fixedObjectName);

  assert.deepEqual(Object.keys(stored[0]).sort(), ['content', 'contentType', 'key']);
  assert.equal(stored[0].contentType, 'image/png');
  assert.equal(stored[0].content, upload.content);
});

test('a content type outside the accepted list is refused and nothing is stored', async () => {
  for (const contentType of [
    undefined,
    null,
    42,
    '',
    'text/html',
    'image/svg+xml',
    'application/octet-stream',
    'application/x-msdownload',
  ]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(validUpload({ contentType }), store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('a content type is read the same whatever case it arrives in', async () => {
  const { store } = recordingStore();

  const { key } = await uploadFile(
    validUpload({ contentType: ' IMAGE/JPEG ' }),
    store,
    fixedObjectName,
  );

  assert.equal(key.endsWith('.jpg'), true);
});

test('a file larger than the maximum is refused and nothing is stored', async () => {
  const { store, stored } = recordingStore();

  const error = await refusal(() =>
    uploadFile(validUpload({ content: Buffer.alloc(MAXIMUM_FILE_SIZE_BYTES + 1) }), store),
  );

  assert.equal(error.statusCode, 413);
  assert.equal(stored.length, 0);
});

test('a file of exactly the maximum size is still stored', async () => {
  const { store, stored } = recordingStore();

  await uploadFile(validUpload({ content: Buffer.alloc(MAXIMUM_FILE_SIZE_BYTES) }), store);

  assert.equal(stored.length, 1);
});

test('an upload carrying no bytes at all is refused', async () => {
  for (const content of [undefined, null, '', Buffer.alloc(0)]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(validUpload({ content }), store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('content that is not bytes is refused rather than stored', async () => {
  for (const content of ['not bytes at all', { length: 10 }, [1, 2, 3], 1024]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(validUpload({ content }), store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('a purpose that names no namespace is refused', async () => {
  for (const purpose of [undefined, null, '', 'secrets', '../payment-receipts', { $ne: null }]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(validUpload({ purpose }), store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('an owner that is not a valid reference is refused', async () => {
  for (const ownerId of [undefined, null, '', '../../etc', 'not-a-member', { $ne: null }, 42]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(validUpload({ ownerId }), store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('an upload that is not an object at all is refused', async () => {
  for (const upload of [undefined, null, 'a file', []]) {
    const { store, stored } = recordingStore();

    const error = await refusal(() => uploadFile(upload, store));

    assert.equal(error.statusCode, 400);
    assert.equal(stored.length, 0);
  }
});

test('a download address is signed for the short window the configuration names', async () => {
  const { store, signed } = recordingStore();

  const address = await createDownloadUrl(storedKey(), undefined, store);

  assert.equal(address, SIGNED_URL);
  assert.equal(signed[0].key, storedKey());
  assert.equal(signed[0].expiresInSeconds, DOWNLOAD_URL_EXPIRY_SECONDS);
});

test('a download window longer than allowed is refused and nothing is signed', async () => {
  for (const expiresInSeconds of [
    MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS + 1,
    0,
    -60,
    60.5,
    '300',
    null,
  ]) {
    const { store, signed } = recordingStore();

    const error = await refusal(() => createDownloadUrl(storedKey(), expiresInSeconds, store));

    assert.equal(error.statusCode, 400);
    assert.equal(signed.length, 0);
  }
});

test('a key this service never wrote is never signed', async () => {
  for (const key of [
    undefined,
    null,
    42,
    '',
    storedKey().replace('.png', '.exe'),
    storedKey().replace(FILE_PURPOSES.PAYMENT_RECEIPT, 'secrets'),
    storedKey(FILE_PURPOSES.PAYMENT_RECEIPT, 'not-a-member'),
    `${FILE_PURPOSES.PAYMENT_RECEIPT}/${MEMBER_ID}/../../${OBJECT_NAME}.png`,
    `/${storedKey()}`,
    `${storedKey()}?versionId=1`,
  ]) {
    const { store, signed } = recordingStore();

    const error = await refusal(() => createDownloadUrl(key, undefined, store));

    assert.equal(error.statusCode, 400);
    assert.equal(signed.length, 0);
  }
});

test('a key this service never wrote is never removed', async () => {
  const { store, removed } = recordingStore();

  const error = await refusal(() => deleteFile(`../${storedKey()}`, store));

  assert.equal(error.statusCode, 400);
  assert.equal(removed.length, 0);
});

test('removing a file names that exact key and nothing else', async () => {
  const { store, removed } = recordingStore();

  await deleteFile(storedKey(), store);

  assert.deepEqual(removed, [{ key: storedKey() }]);
});

test('an upload refuses to store anything when the storage is not configured', async () => {
  const saved = new Map();

  for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }

  try {
    const error = await refusal(() => uploadFile(validUpload()));

    assert.equal(error.name, 'FileStorageConfigurationError');
    assert.equal(error.statusCode, 500);

    for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
      assert.equal(error.message.includes(name), true);
    }
  } finally {
    for (const [name, value] of saved) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
  }
});

test('a configuration with nothing set names every variable that is missing', async () => {
  const error = await refusal(() => readFileStorageConfiguration({}));

  for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
    assert.equal(error.message.includes(name), true);
  }
});

test('a configuration missing a single variable names only that one', async () => {
  const [absent, ...present] = REQUIRED_ENVIRONMENT_VARIABLES;
  const environment = Object.fromEntries(present.map((name) => [name, 'configured']));

  const error = await refusal(() => readFileStorageConfiguration(environment));

  assert.equal(error.message.includes(absent), true);

  for (const name of present) {
    assert.equal(error.message.includes(name), false);
  }
});
