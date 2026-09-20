const { layout, escapeHtml } = require('./layout');

function passwordChangeCode({ code, minutesValid }) {
  return {
    subject: 'Código para cambiar su contraseña',
    text: `Su código de verificación es ${code}. Vence en ${minutesValid} minutos. Si no solicitó este cambio, ignore este mensaje.`,
    html: layout('Código de verificación', [
      `Su código para cambiar la contraseña es <strong>${escapeHtml(code)}</strong>.`,
      `Vence en ${escapeHtml(minutesValid)} minutos.`,
      'Si no solicitó este cambio, ignore este mensaje y su contraseña seguirá igual.',
    ]),
  };
}

module.exports = { passwordChangeCode };
