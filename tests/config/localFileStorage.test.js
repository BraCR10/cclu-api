const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalStore, readPublicAddress } = require('../../src/config/localFileStorage');

const CERTIFICATION_KEY = 'membership-certifications/65f0c3a1b2c3d4e5f6a7b8c9/0123456789abcdef.pdf';

// A directory of its own per test, so nothing this suite writes can reach the
// repository or another test.
async function temporaryStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cclu-files-'));

  return { directory, store: createLocalStore(directory) };
}

test('a file stored on the disk comes back byte for byte', async () => {
  const { directory, store } = await temporaryStore();
  const content = Buffer.from('una personería jurídica');

  await store.putObject({ key: CERTIFICATION_KEY, content, contentType: 'application/pdf' });

  assert.deepEqual(await store.readObject({ key: CERTIFICATION_KEY }), content);

  await store.deleteObject({ key: CERTIFICATION_KEY });

  await assert.rejects(store.readObject({ key: CERTIFICATION_KEY }));

  await fs.rm(directory, { recursive: true, force: true });
});

// The service refuses a key of that shape before it gets here, which is exactly
// why the driver has to refuse it too: the day a caller reaches the driver
// another way is the day this stops being impossible.
test('a key that climbs out of the directory is refused by the driver', async () => {
  const { directory, store } = await temporaryStore();

  for (const key of ['../outside.txt', 'member-logos/../../outside.txt']) {
    await assert.rejects(store.readObject({ key }), `the driver followed ${key}`);
    await assert.rejects(
      store.putObject({ key, content: Buffer.from('x') }),
      `the driver stored ${key}`,
    );
  }

  await fs.rm(directory, { recursive: true, force: true });
});

// A leading slash is not a way out either: the driver reads it as a path inside
// the directory it was given, and that is where the file lands.
test('a key that looks absolute is kept inside the directory', async () => {
  const { directory, store } = await temporaryStore();
  const content = Buffer.from('dentro');

  await store.putObject({ key: '/outside.txt', content });

  assert.deepEqual(await fs.readFile(path.join(directory, 'outside.txt')), content);

  await fs.rm(directory, { recursive: true, force: true });
});

test('a disk hands out an address of its own, with the key as the capability', async () => {
  const { directory, store } = await temporaryStore();

  const address = await store.createSignedDownloadUrl({ key: CERTIFICATION_KEY });

  assert.equal(
    address,
    `${readPublicAddress()}/api/files/membership-certifications%2F65f0c3a1b2c3d4e5f6a7b8c9%2F0123456789abcdef.pdf`,
  );

  await fs.rm(directory, { recursive: true, force: true });
});
