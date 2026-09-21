const moderationService = require('../services/moderationService');

async function listPublications(
  request,
  response,
  next,
  list = moderationService.listPublications,
) {
  response.json(await list(request.query));
}

async function moderate(
  request,
  response,
  next,
  moderatePublication = moderationService.moderatePublication,
) {
  response.json(await moderatePublication(request.params.type, request.params.id, request.body));
}

module.exports = { listPublications, moderate };
