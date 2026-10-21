const clock = require('../config/clock');
const vacancyService = require('../services/vacancyService');
const jobBoardService = require('../services/jobBoardService');

async function getOwnVacancies(request, response, next, list = vacancyService.listOwnVacancies) {
  response.json(await list(request.identity.id, request.query, clock.now()));
}

async function createOwnVacancy(request, response, next, create = vacancyService.createVacancy) {
  response.status(201).json(await create(request.identity.id, request.body, clock.now()));
}

async function deleteOwnVacancy(request, response, next, remove = vacancyService.deleteOwnVacancy) {
  await remove(request.identity.id, request.params.vacancyId, clock.now());
  response.status(204).end();
}

async function getBoard(request, response, next, list = jobBoardService.listBoard) {
  response.json(await list(request.query, clock.now()));
}

async function getBoardVacancy(request, response, next, read = jobBoardService.readBoardVacancy) {
  response.json(await read(request.params.vacancyId, clock.now()));
}

module.exports = {
  getOwnVacancies,
  createOwnVacancy,
  deleteOwnVacancy,
  getBoard,
  getBoardVacancy,
};
