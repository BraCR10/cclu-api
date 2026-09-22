const memberDirectoryService = require('../services/memberDirectoryService');

// Public: the same visitor a card's code answers to may browse the whole
// roll, not only look one business up at a time.
async function listDirectory(
  request,
  response,
  next,
  listPublicDirectory = memberDirectoryService.listPublicDirectory,
) {
  response.json(await listPublicDirectory(request.query));
}

module.exports = { listDirectory };
