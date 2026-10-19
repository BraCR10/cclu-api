const { applicationApproved } = require('./applicationApproved');
const { applicationChangesRequested } = require('./applicationChangesRequested');
const { applicationReceived } = require('./applicationReceived');
const { applicationRejected } = require('./applicationRejected');
const { emailChangeLink } = require('./emailChangeLink');
const { membershipExpiring } = require('./membershipExpiring');
const { membershipLapsed } = require('./membershipLapsed');
const { passwordResetLink } = require('./passwordResetLink');
const { paymentApproved } = require('./paymentApproved');
const { paymentReceived } = require('./paymentReceived');
const { paymentRejected } = require('./paymentRejected');

// A new kind of notification is a new file beside this one and a line here.
// Nothing in the sending component changes.
const TEMPLATES = {
  applicationApproved,
  applicationChangesRequested,
  applicationReceived,
  applicationRejected,
  emailChangeLink,
  membershipExpiring,
  membershipLapsed,
  passwordResetLink,
  paymentApproved,
  paymentReceived,
  paymentRejected,
};

class UnknownTemplateError extends Error {
  constructor(name) {
    super(`There is no email template named ${name}.`);
    this.name = 'UnknownTemplateError';
    this.statusCode = 500;
  }
}

function renderTemplate(name, data = {}) {
  const template = TEMPLATES[name];

  if (template === undefined) {
    throw new UnknownTemplateError(name);
  }

  return template(data);
}

module.exports = { renderTemplate, UnknownTemplateError, TEMPLATE_NAMES: Object.keys(TEMPLATES) };
