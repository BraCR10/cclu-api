const { randomBytes } = require('node:crypto');
const {
  FILE_PURPOSES,
  CONTENT_TYPE_EXTENSIONS,
  MAXIMUM_FILE_SIZE_BYTES,
  DOWNLOAD_URL_EXPIRY_SECONDS,
  MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS,
  objectStore,
} = require('../config/fileStorage');

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

class FileStorageError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'FileStorageError';
    this.statusCode = statusCode;
  }
}

function readPurpose(value) {
  if (typeof value !== 'string' || !PURPOSES.includes(value)) {
    throw new FileStorageError('The file purpose is not one of the accepted values.');
  }

  return value;
}

function readOwnerId(value) {
  if (typeof value !== 'string' || !OWNER_ID_ONLY.test(value)) {
    throw new FileStorageError('The file owner is not a valid reference.');
  }

  return value;
}

function readContentType(value) {
  const contentType = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!ACCEPTED_CONTENT_TYPES.includes(contentType)) {
    throw new FileStorageError('The file type is not one the chamber accepts.');
  }

  return contentType;
}

function readContent(value) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new FileStorageError('The file carries no content.');
  }

  if (value.length > MAXIMUM_FILE_SIZE_BYTES) {
    throw new FileStorageError('The file is larger than allowed.', TOO_LARGE);
  }

  return value;
}

function readStoredKey(value) {
  if (typeof value !== 'string' || !STORED_KEY.test(value)) {
    throw new FileStorageError('The file key is not valid.');
  }

  return value;
}

function readExpirySeconds(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAXIMUM_DOWNLOAD_URL_EXPIRY_SECONDS) {
    throw new FileStorageError('The download window is longer than allowed.');
  }

  return value;
}

// Random bytes, never the uploaded name. A key nobody can guess is what keeps
// one member's receipt out of reach even if an address were to escape.
function randomObjectName() {
  return randomBytes(OBJECT_NAME_BYTES).toString('hex');
}

function buildStorageKey({ purpose, ownerId, objectName, contentType }) {
  return `${purpose}/${ownerId}/${objectName}.${CONTENT_TYPE_EXTENSIONS[contentType]}`;
}

async function uploadFile(upload, store = objectStore(), newObjectName = randomObjectName) {
  if (upload === null || typeof upload !== 'object' || Array.isArray(upload)) {
    throw new FileStorageError('The file is missing.');
  }

  // Read one field at a time. Anything else the caller attached, the uploaded
  // name above all, takes no part in the key or in what is stored.
  const purpose = readPurpose(upload.purpose);
  const ownerId = readOwnerId(upload.ownerId);
  const contentType = readContentType(upload.contentType);
  const content = readContent(upload.content);

  const key = buildStorageKey({
    purpose,
    ownerId,
    objectName: newObjectName(),
    contentType,
  });

  await store.putObject({ key, content, contentType });

  // The key and never an address. Who may open the file is a separate decision,
  // made once the API knows who is asking.
  return { key };
}

async function createDownloadUrl(
  key,
  expiresInSeconds = DOWNLOAD_URL_EXPIRY_SECONDS,
  store = objectStore(),
) {
  const storedKey = readStoredKey(key);
  const windowSeconds = readExpirySeconds(expiresInSeconds);

  return store.createSignedDownloadUrl({ key: storedKey, expiresInSeconds: windowSeconds });
}

// Only the object goes. The record that pointed at it stays, so what a member
// paid and when they paid it is still answerable a year later.
async function deleteFile(key, store = objectStore()) {
  const storedKey = readStoredKey(key);

  await store.deleteObject({ key: storedKey });
}

module.exports = { uploadFile, createDownloadUrl, deleteFile, FileStorageError };
