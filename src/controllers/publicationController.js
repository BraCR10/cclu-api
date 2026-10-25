const publicationService = require('../services/publicationService');

const {
  listOwnPublications,
  readOwnPublication,
  createPublication,
  updatePublication,
  setPublicationStatus,
  deleteOwnPublication,
} = publicationService;

async function getOwnPublications(request, response, next, list = listOwnPublications) {
  response.json(await list(request.identity.id, request.query));
}

async function getOwnPublication(request, response, next, read = readOwnPublication) {
  response.json(await read(request.identity.id, request.params.publicationId));
}

async function createOwnPublication(request, response, next, create = createPublication) {
  response.status(201).json(await create(request.identity.id, request.body));
}

async function updateOwnPublication(request, response, next, update = updatePublication) {
  response.json(await update(request.identity.id, request.params.publicationId, request.body));
}

async function setOwnPublicationStatus(request, response, next, setStatus = setPublicationStatus) {
  response.json(await setStatus(request.identity.id, request.params.publicationId, request.body));
}

async function deleteOwnPublication_(request, response, next, remove = deleteOwnPublication) {
  await remove(request.identity.id, request.params.publicationId);
  response.status(204).end();
}

module.exports = {
  getOwnPublications,
  getOwnPublication,
  createOwnPublication,
  updateOwnPublication,
  setOwnPublicationStatus,
  deleteOwnPublication: deleteOwnPublication_,
};
