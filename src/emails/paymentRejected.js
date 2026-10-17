const { layout, escapeHtml } = require('./layout');

function paymentRejected({ businessName, planName, reason }) {
  return {
    subject: 'Su pago no fue aprobado',
    text: [
      `${businessName}: la Cámara no aprobó su pago del plan ${planName}.`,
      `Motivo: ${reason}`,
      'Puede registrarlo de nuevo desde Mis pagos en su panel.',
    ].join('\n\n'),
    html: layout('Su pago no fue aprobado', [
      `${escapeHtml(businessName)}, la Cámara no aprobó su pago del plan <strong>${escapeHtml(planName)}</strong>.`,
      `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
      'Puede registrarlo de nuevo desde Mis pagos en su panel.',
    ]),
  };
}

module.exports = { paymentRejected };
