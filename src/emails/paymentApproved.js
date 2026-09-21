const { layout, escapeHtml } = require('./layout');

const dateFormatter = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function paymentApproved({ businessName, paidUntil }) {
  const until = dateFormatter.format(new Date(paidUntil));

  return {
    subject: 'Su pago fue aprobado',
    text: `${businessName}: su pago de membresía fue aprobado. Su membresía paga está vigente hasta el ${until}.`,
    html: layout('Su pago fue aprobado', [
      `${escapeHtml(businessName)}, su pago de membresía fue conciliado y aprobado.`,
      `Su membresía paga está vigente hasta el <strong>${escapeHtml(until)}</strong>.`,
    ]),
  };
}

module.exports = { paymentApproved };
