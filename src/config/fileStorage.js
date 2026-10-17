const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('node:path');
const { createLocalStore, readLocalDirectory } = require('./localFileStorage');

// The storage provider is named in this file and nowhere else. The chamber can
// move to another host by changing these values, without touching a service.
// Without them the disk answers instead, which is what a development machine
// has; a deployment that stores files sets all six, and production refuses to
// start without them.
const REQUIRED_ENVIRONMENT_VARIABLES = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_PUBLIC_BUCKET',
  'S3_PRIVATE_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

// Two buckets rather than a permission per file. What anyone may see, a logo or
// a product photo, lives where reading is open. A receipt or a certification
// lives where nothing is public, so no single misconfigured object can expose
// one: only this API reads it, after deciding who is asking.
const FILE_VISIBILITY = Object.freeze({ PUBLIC: 'public', PRIVATE: 'private' });

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
const MAXIMUM_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Where each kind of file lives and what it may be. A rule written for one kind
// never reaches another.
const PURPOSE_RULES = Object.freeze({
  [FILE_PURPOSES.MEMBER_LOGO]: {
    visibility: FILE_VISIBILITY.PUBLIC,
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  [FILE_PURPOSES.MEMBERSHIP_CERTIFICATION]: {
    visibility: FILE_VISIBILITY.PRIVATE,
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  [FILE_PURPOSES.PAYMENT_RECEIPT]: {
    visibility: FILE_VISIBILITY.PRIVATE,
    contentTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  },
});

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
    buckets: {
      [FILE_VISIBILITY.PUBLIC]: environment.S3_PUBLIC_BUCKET,
      [FILE_VISIBILITY.PRIVATE]: environment.S3_PRIVATE_BUCKET,
    },
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,

    // Some hosts serve every bucket from a single address and name the bucket
    // in the path, which the default subdomain addressing cannot reach.
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
  };
}

function createObjectStore(visibility, configuration = readFileStorageConfiguration()) {
  const bucket = configuration.buckets[visibility];
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
          Bucket: bucket,
          Key: key,
          Body: content,
          ContentType: contentType,
        }),
      );
    },

    createSignedDownloadUrl({ key, expiresInSeconds }) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });

      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    // The bytes, for the caller that opens a file through the API rather than
    // through an address the bucket signed.
    async readObject({ key }) {
      const answer = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      return Buffer.from(await answer.Body.transformToByteArray());
    },

    async deleteObject({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

const configuredObjectStores = new Map();

// Whether a bucket was named, which is what decides between the two drivers.
function hasObjectStoreCredentials(environment = process.env) {
  return REQUIRED_ENVIRONMENT_VARIABLES.every((name) => Boolean(environment[name]));
}

// Built on first use rather than on import, so a process that never touches a
// file starts without storage credentials and a missing one fails where it is.
function objectStore(visibility) {
  if (!Object.values(FILE_VISIBILITY).includes(visibility)) {
    throw new TypeError(`There is no file visibility named ${visibility}.`);
  }

  if (!configuredObjectStores.has(visibility)) {
    configuredObjectStores.set(
      visibility,
      hasObjectStoreCredentials()
        ? createObjectStore(visibility)
        : createLocalStore(path.join(readLocalDirectory(), visibility)),
    );
  }

  return configuredObjectStores.get(visibility);
}

// The disk is for a development machine. A production server writing receipts
// to its own disk loses them on the next deploy, so it refuses to start instead.
function assertProductionStorage(environment = process.env) {
  if (environment.NODE_ENV === 'production' && !hasObjectStoreCredentials(environment)) {
    throw new FileStorageConfigurationError(
      `Production stores files in the buckets. Set ${REQUIRED_ENVIRONMENT_VARIABLES.join(', ')}.`,
    );
  }
}

module.exports = {
  REQUIRED_ENVIRONMENT_VARIABLES,
  FILE_VISIBILITY,
  PURPOSE_RULES,
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
  assertProductionStorage,
};
