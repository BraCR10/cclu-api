const { composeEmail, webUrl } = require('./layout');

function membershipLapsed({ businessName, planName }) {
  return composeEmail('Su membresía venció', {
    heading: 'Su membresía venció',
    paragraphs: [
      `${businessName}, su plan ${planName} venció y su membresía pasó al plan Gratuita. Su ficha sigue en el directorio.`,
    ],
    action: { label: 'Elegir un plan', url: webUrl('/member/membership') },
  });
}

module.exports = { membershipLapsed };
