const applicationReviewService = require('../services/applicationReviewService');

async function getPendingApplications(
  request,
  response,
  next,
  listPendingApplications = applicationReviewService.listPendingApplications,
) {
  response.json(await listPendingApplications(request.query));
}

async function getDecidedApplications(
  request,
  response,
  next,
  listDecidedApplications = applicationReviewService.listDecidedApplications,
) {
  response.json(await listDecidedApplications(request.query));
}

async function approveApplication(
  request,
  response,
  next,
  approve = applicationReviewService.approveApplication,
) {
  response.json(await approve(request.params.memberId, request.identity.id));
}

async function rejectApplication(
  request,
  response,
  next,
  reject = applicationReviewService.rejectApplication,
) {
  response.json(await reject(request.params.memberId, request.identity.id, request.body));
}

async function requestChangesApplication(
  request,
  response,
  next,
  requestChanges = applicationReviewService.requestChangesApplication,
) {
  response.json(await requestChanges(request.params.memberId, request.identity.id, request.body));
}

module.exports = {
  getPendingApplications,
  getDecidedApplications,
  approveApplication,
  rejectApplication,
  requestChangesApplication,
};
