const { composeEmail } = require('./layout');

// The address is built by the API from a token it generated, so the button
// carries markup this application wrote rather than a value somebody sent.
function applicationRejected({ businessName, reason, resubmitUrl }) {
  return composeEmail('Su solicitud de afiliación fue rechazada', {
    heading: 'Su solicitud fue rechazada',
    paragraphs: [`Revisamos la solicitud de ${businessName} y no pudimos aprobarla.`],
    details: [{ label: 'Motivo', value: reason }],
    action: { label: 'Corregir y volver a enviar', url: resubmitUrl },
    note:
      resubmitUrl === undefined
        ? 'Comuníquese con la Cámara si desea volver a intentarlo.'
        : 'El enlace es personal: no lo comparta.',
  });
}

module.exports = { applicationRejected };
