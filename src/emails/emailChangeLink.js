const { composeEmail } = require('./layout');

// The message that proves the address being claimed is the applicant's. It goes
// to the address they typed and names the one on file, so somebody who mistyped
// it learns nothing and somebody who did not ask has nothing to click.
function emailChangeLink({ confirmUrl, currentEmail, minutesValid }) {
  return composeEmail('Confirme su nuevo correo', {
    preheader: `El enlace vence en ${minutesValid} minutos.`,
    heading: 'Confirme su nuevo correo',
    paragraphs: [
      `Recibimos una solicitud para que su cuenta de la Cámara use este correo en lugar de ${currentEmail}.`,
      'La cuenta conserva la dirección que tiene hoy hasta que usted confirme.',
    ],
    action: { label: 'Confirmar mi nuevo correo', url: confirmUrl },
    note: `El enlace vence en ${minutesValid} minutos, sirve una sola vez y es personal. Si no lo pidió, ignore este correo: nada cambia.`,
  });
}

module.exports = { emailChangeLink };
