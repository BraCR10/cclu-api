const { layout, escapeHtml } = require('./layout');

function paymentReceived({ businessName, planName, amount, reference }) {
  return {
    subject: 'Recibimos su comprobante de pago',
    text: `${businessName}: recibimos su comprobante de pago del plan ${planName} por ${amount}, con el detalle ${reference}. La Cámara lo revisa en 1 a 2 días hábiles y le avisaremos por este medio.`,
    html: layout('Recibimos su comprobante de pago', [
      `${escapeHtml(businessName)}, recibimos su comprobante de pago del plan <strong>${escapeHtml(planName)}</strong> por ${escapeHtml(amount)}, con el detalle ${escapeHtml(reference)}.`,
      'La Cámara lo revisa en 1 a 2 días hábiles y le avisaremos por este medio.',
    ]),
  };
}

module.exports = { paymentReceived };
