const { layout, escapeHtml } = require('./layout');

function applicationApproved({ businessName, memberCode }) {
  return {
    subject: 'Su solicitud de afiliación fue aprobada',
    text: `${businessName}: su solicitud de afiliación a la Cámara fue aprobada. Su código de agremiado es ${memberCode}. Ya puede iniciar sesión.`,
    html: layout('Su solicitud fue aprobada', [
      `${escapeHtml(businessName)}, su solicitud de afiliación fue aprobada.`,
      `Su código de agremiado es <strong>${escapeHtml(memberCode)}</strong>.`,
      'Ya puede iniciar sesión con el correo y la contraseña que registró.',
    ]),
  };
}

module.exports = { applicationApproved };
