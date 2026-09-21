const { applicationApproved } = require('./applicationApproved');
const { applicationRejected } = require('./applicationRejected');
const { passwordResetLink } = require('./passwordResetLink');
const { administratorInvitation } = require('./administratorInvitation');
const { paymentSubmitted } = require('./paymentSubmitted');
const { paymentApproved } = require('./paymentApproved');
const { paymentRejected } = require('./paymentRejected');

// A new kind of notification is a new file beside this one and a line here.
// Nothing in the sending component changes.
const TEMPLATES = {
  applicationApproved,
  applicationRejected,
  passwordResetLink,
  administratorInvitation,
  paymentSubmitted,
  paymentApproved,
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
