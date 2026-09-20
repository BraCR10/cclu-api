const { layout, escapeHtml } = require('./layout');

function applicationRejected({ businessName, reason }) {
  return {
    subject: 'Su solicitud de afiliación fue rechazada',
    text: `${businessName}: su solicitud de afiliación fue rechazada. Motivo: ${reason}`,
    html: layout('Su solicitud fue rechazada', [
      `${escapeHtml(businessName)}, su solicitud de afiliación fue rechazada.`,
      `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
      'Puede corregir lo indicado y volver a enviar su solicitud.',
    ]),
  };
}

module.exports = { applicationRejected };
