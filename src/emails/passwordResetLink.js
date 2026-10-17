const { composeEmail } = require('./layout');

// The address is built by the API from a token it generated, so the button
// carries markup this application wrote rather than a value somebody sent.
function passwordResetLink({ resetUrl, minutesValid }) {
  return composeEmail('Enlace para cambiar su contraseña', {
    preheader: `El enlace vence en ${minutesValid} minutos.`,
    heading: 'Cambie su contraseña',
    paragraphs: [
      resetUrl === undefined
        ? 'Recibimos una solicitud para cambiar su contraseña. Comuníquese con la Cámara para continuar.'
        : 'Recibimos una solicitud para cambiar la contraseña de su cuenta.',
    ],
    action: { label: 'Crear contraseña nueva', url: resetUrl },
    note: `El enlace vence en ${minutesValid} minutos, sirve una sola vez y es personal. Si no lo pidió, ignore este correo.`,
  });
}

module.exports = { passwordResetLink };
