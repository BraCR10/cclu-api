const { layout, escapeHtml } = require('./layout');

function membershipLapsed({ businessName, planName }) {
  return {
    subject: 'Su membresía venció',
    text: `${businessName}: su plan ${planName} venció y su membresía pasó al plan Gratuita. Su ficha sigue en el directorio. Puede volver a un plan pagado registrando el pago desde su panel.`,
    html: layout('Su membresía venció', [
      `${escapeHtml(businessName)}, su plan <strong>${escapeHtml(planName)}</strong> venció y su membresía pasó al plan Gratuita.`,
      'Su ficha sigue en el directorio.',
      'Puede volver a un plan pagado registrando el pago desde su panel.',
    ]),
  };
}

module.exports = { membershipLapsed };
