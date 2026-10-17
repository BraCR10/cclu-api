const { composeEmail, webUrl } = require('./layout');

// The code travels in the message, which is the only place the applicant reads
// it before they can sign in and find it again.
function applicationApproved({ businessName, memberCode }) {
  return composeEmail('Su solicitud de afiliación fue aprobada', {
    preheader: `Bienvenido a la Cámara. Su código de agremiado es ${memberCode}.`,
    heading: '¡Bienvenido a la Cámara!',
    paragraphs: [`La solicitud de ${businessName} fue aprobada.`],
    details: [{ label: 'Código de agremiado', value: memberCode, highlight: true }],
    action: { label: 'Iniciar sesión', url: webUrl('/login') },
    note: 'Ingrese con el correo y la contraseña que registró.',
  });
}

module.exports = { applicationApproved };
