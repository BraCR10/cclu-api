const jobService = require('../services/jobService');

// Public: anyone may browse the board or open one posting.
async function list(request, response, next, listJobs = jobService.listJobs) {
  response.json(await listJobs(request.query));
}

async function getOne(request, response, next, getJobById = jobService.getJobById) {
  response.json(await getJobById(request.params.id));
}

// The rest require a member session, and act only on that member's own
// postings: the identity comes from the session, never from the body.
async function listMine(request, response, next, listOwnJobs = jobService.listOwnJobs) {
  response.json(await listOwnJobs(request.identity.id));
}

async function create(request, response, next, createJob = jobService.createJob) {
  response.status(201).json(await createJob(request.identity.id, request.body));
}

async function update(request, response, next, updateJob = jobService.updateJob) {
  response.json(await updateJob(request.params.id, request.identity.id, request.body));
}

async function close(request, response, next, closeJob = jobService.closeJob) {
  await closeJob(request.params.id, request.identity.id);
  response.status(204).end();
}

module.exports = { list, getOne, listMine, create, update, close };
