const { layout, escapeHtml } = require('./layout');

function paymentRejected({ businessName, reason }) {
  return {
    subject: 'Su pago no pudo ser aprobado',
    text: `${businessName}: su pago de membresía fue revisado y no pudo ser aprobado. Motivo: ${reason}. Puede registrar un nuevo pago con el comprobante correcto.`,
    html: layout('Su pago no pudo ser aprobado', [
      `${escapeHtml(businessName)}, su pago de membresía fue revisado y no pudo ser aprobado.`,
      `Motivo: ${escapeHtml(reason)}`,
      'Puede registrar un nuevo pago con el comprobante correcto desde la plataforma.',
    ]),
  };
}

module.exports = { paymentRejected };
