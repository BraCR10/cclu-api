const applicationReviewService = require('../services/applicationReviewService');

async function getPendingApplications(
  request,
  response,
  next,
  listPendingApplications = applicationReviewService.listPendingApplications,
) {
  response.json(await listPendingApplications());
}

async function getDecidedApplications(
  request,
  response,
  next,
  listDecidedApplications = applicationReviewService.listDecidedApplications,
) {
  response.json(await listDecidedApplications());
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

module.exports = {
  getPendingApplications,
  getDecidedApplications,
  approveApplication,
  rejectApplication,
};
