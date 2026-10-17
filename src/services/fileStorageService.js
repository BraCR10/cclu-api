const { createHash, randomBytes } = require('node:crypto');
const {
  FILE_PURPOSES,
  FILE_VISIBILITY,
  PURPOSE_RULES,
  CONTENT_TYPE_EXTENSIONS,
  MAXIMUM_FILE_SIZE_BYTES,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS,
  objectStore,
} = require('../config/fileStorage');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

const PURPOSES = Object.values(FILE_PURPOSES);
const ACCEPTED_CONTENT_TYPES = Object.keys(CONTENT_TYPE_EXTENSIONS);
const STORED_EXTENSIONS = Object.values(CONTENT_TYPE_EXTENSIONS);

const OWNER_ID = '[0-9a-fA-F]{24}';
const OBJECT_NAME_BYTES = 16;
const OBJECT_NAME = `[0-9a-f]{${OBJECT_NAME_BYTES * 2}}`;
const OWNER_ID_ONLY = new RegExp(`^${OWNER_ID}$`);

// The shape this service writes, and the only shape it will sign or remove. A
// key from anywhere else could name an object the chamber never stored.
const STORED_KEY = new RegExp(
  `^(${PURPOSES.join('|')})/${OWNER_ID}/${OBJECT_NAME}\\.(${STORED_EXTENSIONS.join('|')})$`,
);

const TOO_LARGE = 413;

class FileStorageError extends ApplicationError {
  constructor(code, message, statusCode = 400) {
    super(code, message, { statusCode, name: 'FileStorageError' });
  }
}

function readPurpose(value) {
  if (typeof value !== 'string' || !PURPOSES.includes(value)) {
    throw new FileStorageError(
      ERROR_CODES.NOT_ALLOWED,
      'The file purpose is not one of the accepted values.',
    );
  }

  return value;
}

function readOwnerId(value) {
  if (typeof value !== 'string' || !OWNER_ID_ONLY.test(value)) {
    throw new FileStorageError(
      ERROR_CODES.INVALID_FORMAT,
      'The file owner is not a valid reference.',
    );
  }

  return value;
}

function refuseType() {
  throw new FileStorageError(
    ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
    'The file type is not one the chamber accepts.',
  );
}

function readContentType(value) {
  const contentType = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!ACCEPTED_CONTENT_TYPES.includes(contentType)) {
    refuseType();
  }

  return contentType;
}

// The first bytes every file of each accepted type starts with. The type the
// client declares is written by whoever uploads; these are written by the
// program that made the file, so a page renamed to .png is caught here.
const SIGNATURES = [
  {
    contentType: 'image/jpeg',
    matches: (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    contentType: 'image/png',
    matches: (bytes) =>
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    contentType: 'image/webp',
    matches: (bytes) =>
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    contentType: 'application/pdf',
    matches: (bytes) => bytes.subarray(0, 5).toString('latin1') === '%PDF-',
  },
];

function detectContentType(content) {
  return SIGNATURES.find((signature) => signature.matches(content))?.contentType ?? null;
}

// The type is what the bytes say, and it has to agree with what was declared
// and be one this kind of file may be.
function readActualContentType(declared, content, purpose) {
  const actual = detectContentType(content);

  if (
    actual === null ||
    actual !== declared ||
    !PURPOSE_RULES[purpose].contentTypes.includes(actual)
  ) {
    refuseType();
  }

  return actual;
}

function visibilityOf(purpose) {
  return PURPOSE_RULES[purpose].visibility;
}

function readContent(value) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new FileStorageError(ERROR_CODES.REQUIRED, 'The file carries no content.');
  }

  if (value.length > MAXIMUM_FILE_SIZE_BYTES) {
    throw new FileStorageError(
      ERROR_CODES.FILE_TOO_LARGE,
      'The file is larger than allowed.',
      TOO_LARGE,
    );
  }

  return value;
}

function readStoredKey(value) {
  if (typeof value !== 'string' || !STORED_KEY.test(value)) {
    throw new FileStorageError(ERROR_CODES.INVALID_FORMAT, 'The file key is not valid.');
  }

  return value;
}

function readExpirySeconds(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS) {
    throw new FileStorageError(
      ERROR_CODES.NOT_ALLOWED,
      'The download window is longer than allowed.',
    );
  }

  return value;
}

// Random bytes, never the uploaded name: 128 bits nobody can guess. It is not
// what protects a private file, which only the API serves after deciding who
// is asking, but it keeps keys from being enumerated.
function randomObjectName() {
  return randomBytes(OBJECT_NAME_BYTES).toString('hex');
}

function buildStorageKey({ purpose, ownerId, objectName, contentType }) {
  return `${purpose}/${ownerId}/${objectName}.${CONTENT_TYPE_EXTENSIONS[contentType]}`;
}

// A caller names the kinds of file it may store, so a route that serves people
// without an account cannot be used to plant a receipt in somebody's folder.
async function uploadFile(
  upload,
  store = undefined,
  newObjectName = randomObjectName,
  allowedPurposes = PURPOSES,
) {
  if (upload === null || typeof upload !== 'object' || Array.isArray(upload)) {
    throw new FileStorageError(ERROR_CODES.REQUIRED, 'The file is missing.');
  }

  // Read one field at a time. Anything else the caller attached, the uploaded
  // name above all, takes no part in the key or in what is stored.
  const purpose = readPurpose(upload.purpose);

  if (!allowedPurposes.includes(purpose)) {
    throw new FileStorageError(ERROR_CODES.NOT_ALLOWED, 'This kind of file is not stored here.');
  }

  const ownerId = readOwnerId(upload.ownerId);
  const declaredType = readContentType(upload.contentType);
  const content = readContent(upload.content);
  const contentType = readActualContentType(declaredType, content, purpose);

  const key = buildStorageKey({
    purpose,
    ownerId,
    objectName: newObjectName(),
    contentType,
  });

  await (store ?? objectStore(visibilityOf(purpose))).putObject({ key, content, contentType });

  // The key and never an address. Who may open the file is a separate decision,
  // made once the API knows who is asking. The fingerprint lets a caller tell
  // when the same file was handed in before.
  return {
    key,
    contentType,
    size: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function storeFor(key, store) {
  return store ?? objectStore(visibilityOf(key.split('/')[0]));
}

// Whether a stored file is one anybody may see. Only these are served without a
// session.
function isPublicKey(key) {
  return visibilityOf(readStoredKey(key).split('/')[0]) === FILE_VISIBILITY.PUBLIC;
}

async function createDownloadUrl(key, expiresInSeconds = DOWNLOAD_URL_EXPIRY_SECONDS, store) {
  const storedKey = readStoredKey(key);
  const windowSeconds = readExpirySeconds(expiresInSeconds);

  return storeFor(storedKey, store).createSignedDownloadUrl({
    key: storedKey,
    expiresInSeconds: windowSeconds,
  });
}

// Only the object goes. The record that pointed at it stays, so what a member
// paid and when they paid it is still answerable a year later.
async function deleteFile(key, store) {
  const storedKey = readStoredKey(key);

  await storeFor(storedKey, store).deleteObject({ key: storedKey });
}

// The extension the key was written under is what the answer carries, so a
// browser opens the file instead of downloading a nameless stream.
const CONTENT_TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(CONTENT_TYPE_EXTENSIONS).map(([contentType, extension]) => [
    extension,
    contentType,
  ]),
);

function contentTypeFor(key) {
  const storedKey = readStoredKey(key);

  return CONTENT_TYPE_BY_EXTENSION[storedKey.split('.').pop()] ?? 'application/octet-stream';
}

// The bytes themselves, for whoever opens a file through the API rather than
// through an address the bucket signed.
async function readFile(key, store) {
  const storedKey = readStoredKey(key);

  return storeFor(storedKey, store).readObject({ key: storedKey });
}

module.exports = {
  PURPOSES,
  detectContentType,
  isPublicKey,
  uploadFile,
  createDownloadUrl,
  deleteFile,
  readFile,
  contentTypeFor,
  FileStorageError,
};
