const nodemailer = require('nodemailer');
const { readMailerConfig } = require('../config/mailer');
const { renderTemplate } = require('../emails');

class EmailDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.statusCode = 502;
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let sharedTransport = null;

// Built once and kept, because a transport holds a connection pool. Reading the
// configuration here rather than at import time keeps the failure at send time.
function openTransport(readConfig = readMailerConfig) {
  if (sharedTransport === null) {
    const { from, ...connection } = readConfig();

    sharedTransport = { transport: nodemailer.createTransport(connection), from };
  }

  return sharedTransport;
}

function forgetTransport() {
  sharedTransport = null;
}

function readRecipient(recipient) {
  if (typeof recipient !== 'string' || !EMAIL_SHAPE.test(recipient.trim())) {
    throw new EmailDeliveryError('The recipient address is not an address.');
  }

  return recipient.trim();
}

// Throws when the message does not leave. Callers for whom delivery is the
// point, such as a verification code, must not continue without it.
async function sendEmail(templateName, recipient, data = {}, open = openTransport) {
  const address = readRecipient(recipient);
  const message = renderTemplate(templateName, data);
  const { transport, from } = open();

  try {
    return await transport.sendMail({ from, to: address, ...message });
  } catch (error) {
    throw new EmailDeliveryError(`The message could not be delivered: ${error.message}`);
  }
}

// For a message that accompanies an operation rather than gating it. The
// operation stands; the caller learns the notice did not go out and says so.
async function notify(templateName, recipient, data = {}, send = sendEmail) {
  try {
    await send(templateName, recipient, data);

    return true;
  } catch (error) {
    // Structured, because the address and the template name are values, not
    // text: a newline in either would otherwise forge a log line.
    console.error('Email not delivered', {
      template: templateName,
      reason: error.message,
    });

    return false;
  }
}

module.exports = { sendEmail, notify, openTransport, forgetTransport, EmailDeliveryError };
