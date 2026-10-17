const { layout, escapeHtml, formatCalendarDay } = require('./layout');

// The last valid day, so "vigente hasta" names the day the member still has.
function membershipExpiring({ businessName, planName, validUntil }) {
  const date = formatCalendarDay(validUntil);

  return {
    subject: 'Su membresía está por vencer',
    text: `${businessName}: su plan ${planName} está vigente hasta el ${date}. Si no se renueva, al día siguiente su membresía pasa al plan Gratuita. Puede registrar el pago de la renovación desde su panel.`,
    html: layout('Su membresía está por vencer', [
      `${escapeHtml(businessName)}, su plan <strong>${escapeHtml(planName)}</strong> está vigente hasta el ${escapeHtml(date)}.`,
      'Si no se renueva, al día siguiente su membresía pasa al plan Gratuita.',
      'Puede registrar el pago de la renovación desde su panel.',
    ]),
  };
}

module.exports = { membershipExpiring };
