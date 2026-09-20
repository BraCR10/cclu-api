const { layout, escapeHtml } = require('./layout');

function passwordResetLink({ resetUrl, minutesValid }) {
  const text = [
    'Recibimos una solicitud para cambiar la contraseña de su cuenta.',
    resetUrl === undefined
      ? 'Comuníquese con la Cámara para continuar.'
      : `Abra este enlace para establecer una nueva: ${resetUrl}`,
    `El enlace vence en ${minutesValid} minutos y sirve una sola vez.`,
    'Si no pidió este cambio, ignore este mensaje y su contraseña seguirá igual.',
  ].join('\n\n');

  const paragraphs = ['Recibimos una solicitud para cambiar la contraseña de su cuenta.'];

  // The address is built by the API from a token it generated, so it is markup
  // this application wrote rather than a value somebody sent.
  paragraphs.push(
    resetUrl === undefined
      ? 'Comuníquese con la Cámara para continuar.'
      : `<a href="${escapeHtml(resetUrl)}">Establecer una contraseña nueva</a>`,
  );

  paragraphs.push(
    `El enlace vence en ${escapeHtml(minutesValid)} minutos y sirve una sola vez. Es personal: no lo comparta.`,
    'Si no pidió este cambio, ignore este mensaje y su contraseña seguirá igual.',
  );

  return {
    subject: 'Enlace para cambiar su contraseña',
    text,
    html: layout('Cambiar su contraseña', paragraphs),
  };
}

module.exports = { passwordResetLink };
