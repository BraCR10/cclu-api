const multer = require('multer');
const { MAXIMUM_FILE_SIZE_BYTES } = require('../config/fileStorage');
const { FileStorageError } = require('../services/fileStorageService');
const { ERROR_CODES } = require('../config/errorCodes');

// One file, held in memory. The service decides where it goes and what it is
// called, so nothing here writes under a name a caller chose.
const readOneFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMUM_FILE_SIZE_BYTES, files: 1 },
}).single('file');

// Multer answers in its own vocabulary. A client decides on codes, so its one
// refusal that matters is translated here rather than reaching the handler.
function readUpload(request, response, next) {
  readOneFile(request, response, (error) => {
    if (error === undefined || error === null) {
      next();
      return;
    }

    next(
      error.code === 'LIMIT_FILE_SIZE'
        ? new FileStorageError(ERROR_CODES.FILE_TOO_LARGE, 'The file is larger than allowed.', 413)
        : new FileStorageError(ERROR_CODES.REQUIRED, 'The file is missing.'),
    );
  });
}

module.exports = { readUpload };
