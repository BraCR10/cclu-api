const { composeEmail, formatCalendarDay, webUrl } = require('./layout');

// The last valid day, as the chamber's calendar names it.
function paymentApproved({ businessName, planName, validUntil }) {
  const date = formatCalendarDay(validUntil);

  return composeEmail('Su pago fue aprobado', {
    preheader: `Su plan ${planName} está vigente hasta el ${date}.`,
    heading: 'Su pago fue aprobado',
    paragraphs: [`${businessName}, gracias por su pago.`],
    details: [
      { label: 'Plan', value: planName },
      { label: 'Vigente hasta', value: date },
    ],
    action: { label: 'Ver mi membresía', url: webUrl('/member/membership') },
  });
}

module.exports = { paymentApproved };
