const adminPaymentService = require('../services/adminPaymentService');
const fileStorageService = require('../services/fileStorageService');
const { sendStoredFile } = require('./fileController');

async function getPayments(request, response, next, list = adminPaymentService.listPayments) {
  response.json(await list(request.query));
}

async function getPayment(request, response, next, read = adminPaymentService.readPayment) {
  response.json(await read(request.params.paymentId));
}

async function getReceipt(
  request,
  response,
  next,
  readKey = adminPaymentService.readReceiptKey,
  readFile = fileStorageService.readFile,
) {
  const key = await readKey(request.params.paymentId);

  sendStoredFile(response, key, await readFile(key));
}

// The administrator comes from the session, so the decision and its audit
// entries name who actually took it.
async function approvePayment(
  request,
  response,
  next,
  approve = adminPaymentService.approvePayment,
) {
  response.json(await approve(request.identity, request.params.paymentId));
}

async function rejectPayment(request, response, next, reject = adminPaymentService.rejectPayment) {
  response.json(await reject(request.identity, request.params.paymentId, request.body));
}

module.exports = { getPayments, getPayment, getReceipt, approvePayment, rejectPayment };
