const adminModerationService = require('../services/adminModerationService');

async function getContent(request, response, next, list = adminModerationService.listContent) {
  response.json(await list(request.params.kind, request.query));
}

async function takeDown(request, response, next, take = adminModerationService.takeDown) {
  response.json(
    await take(request.identity, request.params.kind, request.params.contentId, request.body),
  );
}

async function restore(request, response, next, put = adminModerationService.restore) {
  response.json(await put(request.identity, request.params.kind, request.params.contentId));
}

module.exports = { getContent, takeDown, restore };
