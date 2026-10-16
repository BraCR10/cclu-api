const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createLocalStore } = require('./localFileStorage');

// The storage provider is named in this file and nowhere else. The chamber can
// move to another host by changing these values, without touching a service.
// Without them the disk answers instead, which is what a development machine
// has; a deployment that stores files sets all five.
const REQUIRED_ENVIRONMENT_VARIABLES = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

// The first segment of every key. A payment receipt and a logo never share a
// folder, so a rule written for one can never reach the other.
const FILE_PURPOSES = {
  PAYMENT_RECEIPT: 'payment-receipts',
  MEMBER_LOGO: 'member-logos',
  MEMBERSHIP_CERTIFICATION: 'membership-certifications',
};

// The accepted types and the extension each one is stored under. The name that
// came with the upload is written by whoever uploads, so it decides nothing.
const CONTENT_TYPE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// A receipt photographed with a telephone is the largest thing the chamber
// receives. Past this a file is a mistake or an attempt to fill the bucket.
const MAXIMUM_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Long enough to open the file, short enough that an address copied out of a
// browser history is already dead by the time anyone else reads it.
const DOWNLOAD_URL_EXPIRY_SECONDS = 300;
const MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS = 900;

class FileStorageConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileStorageConfigurationError';

    // A server missing its own credentials is nothing the client did, and the
    // error handler logs the detail rather than answering with it.
    this.statusCode = 500;
  }
}

function readFileStorageConfiguration(environment = process.env) {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => !environment[name]);

  if (missing.length > 0) {
    throw new FileStorageConfigurationError(
      `File storage is not configured. Set ${missing.join(', ')} before storing files.`,
    );
  }

  return {
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    bucket: environment.S3_BUCKET,
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,

    // Some hosts serve every bucket from a single address and name the bucket
    // in the path, which the default subdomain addressing cannot reach.
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
  };
}

function createObjectStore(configuration = readFileStorageConfiguration()) {
  const client = new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: configuration.forcePathStyle,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });

  return {
    // No access control list is sent. The object keeps the bucket's private
    // default, so it is reachable only through an address this API signs.
    async putObject({ key, content, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
          Body: content,
          ContentType: contentType,
        }),
      );
    },

    createSignedDownloadUrl({ key, expiresInSeconds }) {
      const command = new GetObjectCommand({ Bucket: configuration.bucket, Key: key });

      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    // The bytes, for the caller that opens a file through the API rather than
    // through an address the bucket signed.
    async readObject({ key }) {
      const answer = await client.send(
        new GetObjectCommand({ Bucket: configuration.bucket, Key: key }),
      );

      return Buffer.from(await answer.Body.transformToByteArray());
    },

    async deleteObject({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: key }));
    },
  };
}

let configuredObjectStore = null;

// Whether a bucket was named, which is what decides between the two drivers.
function hasObjectStoreCredentials(environment = process.env) {
  return REQUIRED_ENVIRONMENT_VARIABLES.every((name) => Boolean(environment[name]));
}

// Built on first use rather than on import, so a process that never touches a
// file starts without storage credentials and a missing one fails where it is.
function objectStore() {
  if (configuredObjectStore === null) {
    configuredObjectStore = hasObjectStoreCredentials() ? createObjectStore() : createLocalStore();
  }

  return configuredObjectStore;
}

module.exports = {
  REQUIRED_ENVIRONMENT_VARIABLES,
  FILE_PURPOSES,
  CONTENT_TYPE_EXTENSIONS,
  MAXIMUM_FILE_SIZE_BYTES,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS,
  FileStorageConfigurationError,
  readFileStorageConfiguration,
  hasObjectStoreCredentials,
  createObjectStore,
  objectStore,
};
