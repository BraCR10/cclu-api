const paymentService = require('../services/paymentService');
const fileStorageService = require('../services/fileStorageService');
const { sendStoredFile } = require('./fileController');

// The member always comes from the session, so a payment can only be made,
// listed or opened by the member it belongs to.
async function getEligibility(request, response, next, read = paymentService.readEligibility) {
  response.json(await read(request.identity.id));
}

async function submitPayment(request, response, next, submit = paymentService.submitPayment) {
  response.status(201).json(await submit(request.identity.id, request.body, request.file));
}

async function getOwnPayments(request, response, next, list = paymentService.listOwnPayments) {
  response.json(await list(request.identity.id, request.query));
}

async function getOwnPayment(request, response, next, read = paymentService.readOwnPayment) {
  response.json(await read(request.identity.id, request.params.paymentId));
}

async function getOwnReceipt(
  request,
  response,
  next,
  readKey = paymentService.readOwnReceiptKey,
  readFile = fileStorageService.readFile,
) {
  const key = await readKey(request.identity.id, request.params.paymentId);

  sendStoredFile(response, key, await readFile(key));
}

module.exports = { getEligibility, submitPayment, getOwnPayments, getOwnPayment, getOwnReceipt };
