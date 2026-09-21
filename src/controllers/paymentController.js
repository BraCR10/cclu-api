const paymentService = require('../services/paymentService');

// The identity comes from the session, never from the body, so a member can
// only ever register a payment on the account they signed in with.
async function registerOwnPayment(
  request,
  response,
  next,
  registerPayment = paymentService.registerPayment,
) {
  response.status(201).json(await registerPayment(request.identity.id, request.body));
}

async function listOwnPayments(
  request,
  response,
  next,
  listPayments = paymentService.listOwnPayments,
) {
  response.json(await listPayments(request.identity.id));
}

async function listPending(
  request,
  response,
  next,
  listPendingPayments = paymentService.listPendingPayments,
) {
  response.json(await listPendingPayments());
}

async function approve(request, response, next, approvePayment = paymentService.approvePayment) {
  response.json(await approvePayment(request.params.paymentId, request.identity.id));
}

async function reject(request, response, next, rejectPayment = paymentService.rejectPayment) {
  response.json(await rejectPayment(request.params.paymentId, request.identity.id, request.body));
}

async function listForMember(
  request,
  response,
  next,
  listMemberPayments = paymentService.listMemberPayments,
) {
  response.json(await listMemberPayments(request.params.memberId));
}

async function listMemberships(request, response, next, list = paymentService.listMemberships) {
  response.json(await list(request.query));
}

module.exports = {
  registerOwnPayment,
  listOwnPayments,
  listPending,
  approve,
  reject,
  listForMember,
  listMemberships,
};
