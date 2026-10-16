const { layout, escapeHtml } = require('./layout');

// The message that answers a registration on arrival. It says what the
// confirmation screen says, because the screen is closed and this is what the
// applicant keeps.
function applicationReceived({ name, businessName, email, daysToReview }) {
  const greeting = name === undefined || name === '' ? 'Gracias.' : `Gracias, ${name}.`;
  const received = `${greeting} Recibimos la solicitud de afiliación de ${businessName}.`;
  const review = `La Cámara la revisa en un máximo de ${daysToReview} días hábiles y le escribe a ${email}.`;

  const text = [
    received,
    review,
    'Si la aprobamos, recibirá su código de agremiado y el acceso al panel.',
    'Si hay que corregir algún dato, le enviaremos un enlace para hacerlo.',
  ].join('\n\n');

  const paragraphs = [
    `${escapeHtml(greeting)} Recibimos la solicitud de afiliación de ${escapeHtml(businessName)}.`,
    `La Cámara la revisa en un máximo de ${escapeHtml(daysToReview)} días hábiles y le escribe a ${escapeHtml(email)}.`,
    'Si la aprobamos, recibirá su código de agremiado y el acceso al panel.',
    'Si hay que corregir algún dato, le enviaremos un enlace para hacerlo.',
  ];

  return {
    subject: 'Recibimos su solicitud de afiliación',
    text,
    html: layout('Recibimos su solicitud', paragraphs),
  };
}

module.exports = { applicationReceived };
