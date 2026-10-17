const fileStorageService = require('../services/fileStorageService');
const { FILE_PURPOSES } = require('../config/fileStorage');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

// What a person can hand in before they have an account: the logo and the
// certification that go with a registration. A receipt is stored with its
// payment, under the session, and never through here.
const REGISTRATION_PURPOSES = [FILE_PURPOSES.MEMBER_LOGO, FILE_PURPOSES.MEMBERSHIP_CERTIFICATION];

async function uploadFile(request, response, next, upload = fileStorageService.uploadFile) {
  const stored = await upload(
    {
      purpose: request.body?.purpose,
      ownerId: request.body?.ownerId,
      contentType: request.file?.mimetype,
      content: request.file?.buffer,
    },
    undefined,
    undefined,
    REGISTRATION_PURPOSES,
  );

  response.status(201).json({ key: stored.key });
}

// Every file leaves with the same headers. The type is the one its bytes were
// checked against, the browser is told not to guess another, and a PDF or an
// image opened in a tab runs nothing.
function sendStoredFile(response, key, content) {
  response.set('Content-Type', fileStorageService.contentTypeFor(key));
  response.set('X-Content-Type-Options', 'nosniff');
  response.set(
    'Content-Security-Policy',
    "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
  );
  response.set('Content-Disposition', 'inline');
  response.set('Cache-Control', 'private, no-store');
  response.send(content);
}

function notFound() {
  return new ApplicationError(ERROR_CODES.ROUTE_NOT_FOUND, 'There is no such file.', {
    statusCode: 404,
  });
}

// A key that is not even a key this service writes is as private as any other.
function isServedPublicly(key) {
  try {
    return fileStorageService.isPublicKey(key);
  } catch {
    return false;
  }
}

// Open to anyone, for the files anyone may see. A private key answers as if it
// did not exist, so this route says nothing about which ones do.
async function openPublicFile(request, response, next, read = fileStorageService.readFile) {
  const { key } = request.params;

  if (!isServedPublicly(key)) {
    throw notFound();
  }

  sendStoredFile(response, key, await read(key));
}

// For an administrator reviewing what a member handed in, such as the
// certification of a registration. The session and the role were checked
// before this runs.
async function openFileAsAdmin(request, response, next, read = fileStorageService.readFile) {
  sendStoredFile(response, request.params.key, await read(request.params.key));
}

module.exports = {
  REGISTRATION_PURPOSES,
  uploadFile,
  openPublicFile,
  openFileAsAdmin,
  sendStoredFile,
};
