const { composeEmail, formatCalendarDay, webUrl } = require('./layout');

// The last valid day, so "vigente hasta" names the day the member still has.
function membershipExpiring({ businessName, planName, validUntil }) {
  const date = formatCalendarDay(validUntil);

  return composeEmail('Su membresía está por vencer', {
    preheader: `Su plan ${planName} está vigente hasta el ${date}.`,
    heading: 'Su membresía está por vencer',
    paragraphs: [`${businessName}, renueve a tiempo para mantener los beneficios de su plan.`],
    details: [
      { label: 'Plan', value: planName },
      { label: 'Vigente hasta', value: date },
    ],
    action: { label: 'Renovar mi plan', url: webUrl('/member/membership') },
    note: 'Si no se renueva, al día siguiente su membresía pasa al plan Gratuita.',
  });
}

module.exports = { membershipExpiring };
