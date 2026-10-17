const { composeEmail } = require('./layout');

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

  return composeEmail('Su solicitud de afiliación necesita correcciones', {
    heading: 'Su solicitud necesita correcciones',
    paragraphs: [`Revisamos la solicitud de ${businessName}. Corrija lo indicado para continuar.`],
    details: [
      { label: 'Motivo', value: reason },
      ...corrections.map(({ label, message }) => ({
        label: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
        value: message,
      })),
    ],
    action: { label: 'Corregir mi solicitud', url: resubmitUrl },
    note:
      resubmitUrl === undefined
        ? 'Comuníquese con la Cámara para volver a enviar su solicitud.'
        : 'El enlace es personal: no lo comparta.',
  });
}

module.exports = { applicationChangesRequested, FIELD_LABELS };
