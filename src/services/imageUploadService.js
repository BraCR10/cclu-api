const { uploadFile, FileStorageError } = require('./fileStorageService');

// Only the part after the comma is bytes; the "data:image/png;base64," prefix
// a browser's FileReader attaches is not part of the encoding.
function stripDataUrlPrefix(value) {
  const commaIndex = value.indexOf(',');

  return value.startsWith('data:') && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

// Buffer.from('base64') silently drops whatever it cannot read rather than
// refusing it, so the shape is checked here first.
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeBase64(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FileStorageError('The file content is missing.');
  }

  const encoded = stripDataUrlPrefix(value.trim());

  if (encoded.length === 0 || encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
    throw new FileStorageError('The file content is not valid base64.');
  }

  return Buffer.from(encoded, 'base64');
}

// Adapts a JSON body carrying base64 text to the Buffer that fileStorageService
// expects. Everything past decoding — purpose, ownership, content type, size —
// is still that service's rule to enforce, not repeated here.
async function uploadImage({ purpose, ownerId, contentType, base64 }, upload = uploadFile) {
  const content = decodeBase64(base64);

  return upload({ purpose, ownerId, contentType, content });
}

module.exports = { uploadImage, decodeBase64 };
