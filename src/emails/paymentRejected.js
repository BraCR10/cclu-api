const { composeEmail, webUrl } = require('./layout');

function paymentRejected({ businessName, planName, reason }) {
  return composeEmail('Su pago no fue aprobado', {
    heading: 'Su pago no fue aprobado',
    paragraphs: [`${businessName}, revisamos su pago del plan ${planName} y no pudimos aprobarlo.`],
    details: [{ label: 'Motivo', value: reason }],
    action: { label: 'Registrar de nuevo', url: webUrl('/member/payments') },
  });
}

module.exports = { paymentRejected };
