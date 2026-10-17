const { composeEmail, webUrl } = require('./layout');

function paymentReceived({ businessName, planName, amount, reference }) {
  return composeEmail('Recibimos su comprobante de pago', {
    preheader: 'La Cámara lo revisa en 1 a 2 días hábiles.',
    heading: 'Recibimos su comprobante',
    paragraphs: [`${businessName}, la Cámara revisará su pago en 1 a 2 días hábiles.`],
    details: [
      { label: 'Plan', value: planName },
      { label: 'Monto', value: amount },
      { label: 'Detalle', value: reference },
    ],
    action: { label: 'Ver mis pagos', url: webUrl('/member/payments') },
  });
}

module.exports = { paymentReceived };
