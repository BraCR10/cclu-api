const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readFileStorageConfiguration,
  FileStorageConfigurationError,
} = require('../../src/config/fileStorage');

const CONFIGURED = {
  S3_ENDPOINT: 'https://storage.example',
  S3_REGION: 'us-west-2',
  S3_PUBLIC_BUCKET: 'cclu-prod-public',
  S3_PRIVATE_BUCKET: 'cclu-prod-private',
  S3_ACCESS_KEY_ID: 'an-access-key',
  S3_SECRET_ACCESS_KEY: 'a-secret',
  S3_FORCE_PATH_STYLE: 'true',
};

// These are written by hand into a file, and a bucket name with a space in front
// of it is a bucket that does not exist. The failure would arrive as a
// permission error on every upload rather than as a typo.
test('the values written by hand are trimmed', () => {
  const configuration = readFileStorageConfiguration({
    ...CONFIGURED,
    S3_PUBLIC_BUCKET: ' cclu-prod-public ',
    S3_ACCESS_KEY_ID: ' an-access-key\n',
  });

  assert.equal(configuration.buckets.public, 'cclu-prod-public');
  assert.equal(configuration.accessKeyId, 'an-access-key');
});

// A value that is only spaces would pass a presence check and fail later.
test('a variable that is only spaces counts as missing', () => {
  assert.throws(
    () => readFileStorageConfiguration({ ...CONFIGURED, S3_PUBLIC_BUCKET: '   ' }),
    FileStorageConfigurationError,
  );
});

test('the path style flag follows the variable, which is a string in a file', () => {
  assert.equal(readFileStorageConfiguration(CONFIGURED).forcePathStyle, true);
  assert.equal(
    readFileStorageConfiguration({ ...CONFIGURED, S3_FORCE_PATH_STYLE: 'false' }).forcePathStyle,
    false,
  );
});
