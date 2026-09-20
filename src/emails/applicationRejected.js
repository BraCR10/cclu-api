const { layout, escapeHtml } = require('./layout');

function applicationRejected({ businessName, reason, resubmitUrl }) {
  const text = [
    `${businessName}: su solicitud de afiliación fue rechazada.`,
    `Motivo: ${reason}`,
    resubmitUrl === undefined
      ? 'Comuníquese con la Cámara si desea volver a intentarlo.'
      : `Puede corregir lo indicado y volver a enviarla aquí: ${resubmitUrl}`,
  ].join('\n\n');

  const paragraphs = [
    `${escapeHtml(businessName)}, su solicitud de afiliación fue rechazada.`,
    `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
  ];

  // The address is built by the API from a token it generated, so it is markup
  // this application wrote rather than a value somebody sent.
  paragraphs.push(
    resubmitUrl === undefined
      ? 'Comuníquese con la Cámara si desea volver a intentarlo.'
      : `Puede corregir lo indicado y <a href="${escapeHtml(resubmitUrl)}">volver a enviar su solicitud</a>. El enlace es personal: no lo comparta.`,
  );

  return {
    subject: 'Su solicitud de afiliación fue rechazada',
    text,
    html: layout('Su solicitud fue rechazada', paragraphs),
  };
}

module.exports = { applicationRejected };
