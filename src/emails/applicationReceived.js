const { composeEmail } = require('./layout');

// Sent when a registration arrives. It is what the applicant keeps once the
// confirmation screen is closed.
function applicationReceived({ name, businessName, email, daysToReview }) {
  const greeting = name === undefined || name === '' ? 'Gracias.' : `Gracias, ${name}.`;

  return composeEmail('Recibimos su solicitud de afiliación', {
    preheader: `La Cámara la revisa en un máximo de ${daysToReview} días hábiles.`,
    heading: 'Recibimos su solicitud',
    paragraphs: [
      `${greeting} La Cámara revisará la solicitud de ${businessName} en un máximo de ${daysToReview} días hábiles.`,
    ],
    details: [
      { label: 'Comercio', value: businessName },
      { label: 'Le escribiremos a', value: email },
    ],
    note: 'Si hay que corregir algún dato, le enviaremos un enlace para hacerlo.',
  });
}

module.exports = { applicationReceived };
