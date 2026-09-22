const { layout, escapeHtml } = require('./layout');

// Sent to an administrator, not to the member: it is the reviewer who needs to
// learn there is work waiting without watching the panel.
function paymentSubmitted({ businessName }) {
  return {
    subject: 'Nuevo pago pendiente de revisión',
    text: `${businessName} registró un pago de membresía que está pendiente de revisión. Ingrese al panel administrativo para conciliarlo.`,
    html: layout('Nuevo pago pendiente de revisión', [
      `<strong>${escapeHtml(businessName)}</strong> registró un pago de membresía.`,
      'Ingrese al panel administrativo para revisar el comprobante y conciliarlo.',
    ]),
  };
}

module.exports = { paymentSubmitted };
