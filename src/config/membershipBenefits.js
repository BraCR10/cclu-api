// What each membership opens, written once where both the API and a reader can
// find it. The sentences are user-facing content, so they stay in Spanish.
const MEMBERSHIP_BENEFITS = {
  free: [
    'Aparecer en el directorio de Comercios Afiliados',
    'Carné digital con código QR',
    'Consultar el Marketplace, promociones, descuentos y vacantes',
    'Consultar y utilizar los descuentos para afiliados',
  ],
  paid: [
    'Publicar productos y servicios en el Marketplace',
    'Publicar promociones',
    'Publicar descuentos para afiliados',
    'Publicar vacantes en la Bolsa de Empleo',
  ],
};

module.exports = { MEMBERSHIP_BENEFITS };
