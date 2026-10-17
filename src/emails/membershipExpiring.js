const { layout, escapeHtml } = require('./layout');

// Shown as the chamber reads a calendar, not in the server's own time zone.
const EXPIRY_DATE = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'long',
  timeZone: 'America/Costa_Rica',
});

function membershipExpiring({ businessName, planName, expiresAt }) {
  const date = EXPIRY_DATE.format(new Date(expiresAt));

  return {
    subject: 'Su membresía está por vencer',
    text: `${businessName}: su plan ${planName} vence el ${date}. Si no se renueva, su membresía pasa al plan Gratuita. Puede registrar el pago de la renovación desde su panel.`,
    html: layout('Su membresía está por vencer', [
      `${escapeHtml(businessName)}, su plan <strong>${escapeHtml(planName)}</strong> vence el ${escapeHtml(date)}.`,
      'Si no se renueva, su membresía pasa al plan Gratuita.',
      'Puede registrar el pago de la renovación desde su panel.',
    ]),
  };
}

module.exports = { membershipExpiring };
