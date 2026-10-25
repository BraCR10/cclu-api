const { composeEmail } = require('./layout');

// Sent to somebody who is not an administrator yet. The address is built by the
// API from a token it generated, so the button carries markup this application
// wrote rather than a value somebody sent.
function adminInvitation({ invitationUrl, invitedBy, daysValid }) {
  return composeEmail('Invitación al panel de la Cámara', {
    preheader: `El enlace vence en ${daysValid} días.`,
    heading: 'Lo invitaron al panel de la Cámara',
    paragraphs: [
      invitedBy === undefined
        ? 'Recibió una invitación para administrar el panel de la Cámara de Comercio de La Unión.'
        : `${invitedBy} lo invitó a administrar el panel de la Cámara de Comercio de La Unión.`,
      invitationUrl === undefined
        ? 'Comuníquese con la Cámara para recibir un enlace nuevo.'
        : 'Cree su contraseña para entrar. Su correo ya queda asociado a la cuenta.',
    ],
    action: { label: 'Crear mi contraseña', url: invitationUrl },
    note: `El enlace vence en ${daysValid} días y sirve una sola vez. Si no esperaba esta invitación, ignore este correo.`,
  });
}

module.exports = { adminInvitation };
