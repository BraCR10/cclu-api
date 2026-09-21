const { layout, escapeHtml } = require('./layout');

function administratorInvitation({ invitationUrl, daysValid }) {
  const text = [
    'Fue invitado a administrar el panel de la Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión.',
    invitationUrl === undefined
      ? 'Comuníquese con la Cámara para continuar.'
      : `Abra este enlace para aceptar la invitación: ${invitationUrl}`,
    daysValid === undefined
      ? 'La invitación no vence.'
      : `La invitación vence en ${daysValid} días y sirve una sola vez.`,
  ].join('\n\n');

  const paragraphs = [
    'Fue invitado a administrar el panel de la Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión.',
  ];

  paragraphs.push(
    invitationUrl === undefined
      ? 'Comuníquese con la Cámara para continuar.'
      : `<a href="${escapeHtml(invitationUrl)}">Aceptar la invitación</a>`,
  );

  paragraphs.push(
    daysValid === undefined
      ? 'La invitación no vence.'
      : `La invitación vence en ${escapeHtml(daysValid)} días y sirve una sola vez. Es personal: no la comparta.`,
  );

  return {
    subject: 'Invitación para administrar el panel de la Cámara',
    text,
    html: layout('Invitación de administrador', paragraphs),
  };
}

module.exports = { administratorInvitation };
