const { layout, escapeHtml } = require('./layout');

// The applicant reads these, so they are written out rather than shown as the
// identifiers the API stores. A test checks that every field the chamber may ask
// to have corrected has a name here, so an identifier never reaches an inbox.
const FIELD_LABELS = {
  memberType: 'tipo de afiliación',
  identificationType: 'tipo de identificación',
  identificationNumber: 'número de identificación',
  legalName: 'razón social',
  name: 'nombre completo',
  businessName: 'nombre comercial',
  managerName: 'persona encargada',
  activity: 'actividad comercial',
  activityOther: 'actividad comercial',
  canton: 'cantón',
  district: 'distrito',
  phone: 'teléfono',
  whatsappNumber: 'WhatsApp',
};

// Each field carries what the chamber said about it, so a name without a reason
// never reaches anybody: somebody told to fix a field and not told what is wrong
// with it has nowhere to look.
function correctionsIn(fields) {
  return fields.map(({ field, message }) => ({ label: FIELD_LABELS[field], message }));
}

function applicationChangesRequested({ businessName, reason, fields = [], resubmitUrl }) {
  const corrections = correctionsIn(fields);

  const text = [
    `${businessName}: necesitamos que corrija su solicitud de afiliación.`,
    `Motivo: ${reason}`,
    corrections.length === 0
      ? null
      : [
          'Datos por corregir:',
          ...corrections.map(({ label, message }) => `- ${label}: ${message}`),
        ].join('\n'),
    resubmitUrl === undefined
      ? 'Comuníquese con la Cámara para volver a enviar su solicitud.'
      : `Puede corregir y volver a enviarla aquí: ${resubmitUrl}`,
  ]
    .filter((paragraph) => paragraph !== null)
    .join('\n\n');

  const paragraphs = [
    `${escapeHtml(businessName)}, revisamos su solicitud de afiliación y necesitamos que corrija algunos datos antes de continuar.`,
    `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
  ];

  if (corrections.length > 0) {
    const items = corrections
      .map(({ label, message }) => `<li>${escapeHtml(label)}: ${escapeHtml(message)}</li>`)
      .join('');

    paragraphs.push(`<strong>Datos por corregir:</strong><ul>${items}</ul>`);
  }

  // The address is built by the API from a token it generated, so it is markup
  // this application wrote rather than a value somebody sent.
  paragraphs.push(
    resubmitUrl === undefined
      ? 'Comuníquese con la Cámara para volver a enviar su solicitud.'
      : `Puede corregir y <a href="${escapeHtml(resubmitUrl)}">volver a enviar su solicitud</a> desde este enlace. El enlace es personal: no lo comparta.`,
  );

  return {
    subject: 'Su solicitud de afiliación necesita correcciones',
    text,
    html: layout('Su solicitud necesita correcciones', paragraphs),
  };
}

module.exports = { applicationChangesRequested, FIELD_LABELS };
