const fileStorageService = require('../services/fileStorageService');

// Nothing here names the provider. The service decides where the bytes go and
// answers with the key; whether this caller may store one is the route's
// business, decided before the handler runs.
async function uploadFile(request, response, next, upload = fileStorageService.uploadFile) {
  const stored = await upload({
    purpose: request.body?.purpose,
    ownerId: request.body?.ownerId,
    contentType: request.file?.mimetype,
    content: request.file?.buffer,
  });

  response.status(201).json(stored);
}

// The key is the whole capability: 256 random bits, so an address carrying one
// was only ever reached by somebody it was handed to.
async function openFile(request, response, next, read = fileStorageService.readFile) {
  const content = await read(request.params.key);

  response.set('Content-Type', fileStorageService.contentTypeFor(request.params.key));
  response.set('Cache-Control', 'private, no-store');
  response.send(content);
}

module.exports = { uploadFile, openFile };
