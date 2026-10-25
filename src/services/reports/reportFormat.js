const { DateTime } = require('luxon');
const { CHAMBER_TIME_ZONE } = require('../../config/chamberCalendar');

// One way of writing each kind of value, shared by the preview, the CSV and the
// PDF, so the three always say the same thing.
function formatDay(instant) {
  if (instant === null || instant === undefined) {
    return '';
  }

  return DateTime.fromJSDate(new Date(instant), { zone: CHAMBER_TIME_ZONE })
    .setLocale('es')
    .toFormat('d LLL yyyy')
    .replace('.', '');
}

function formatInstant(instant) {
  return DateTime.fromJSDate(new Date(instant), { zone: CHAMBER_TIME_ZONE })
    .setLocale('es')
    .toFormat('d LLL yyyy, H:mm')
    .replace('.', '');
}

// A publication that carries no price, as a promotion and a discount do not,
// writes nothing rather than a zero it never had.
function formatColones(amount) {
  if (amount === null || amount === undefined) {
    return '';
  }

  return `₡${Math.trunc(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

const MEMBER_TYPE_LABELS = {
  business: 'Empresa',
  association: 'Asociación',
  independent_professional: 'Profesional independiente',
};

const ACCOUNT_STATUS_LABELS = { active: 'Activa', suspended: 'Suspendida' };

const WORKDAY_LABELS = {
  full_time: 'Tiempo completo',
  part_time: 'Medio tiempo',
  temporary: 'Temporal',
};

const FREQUENCY_LABELS = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const SUBSCRIBER_STATUS_LABELS = { subscribed: 'Suscrito', unsubscribed: 'Dado de baja' };

const PUBLICATION_TYPE_LABELS = {
  product: 'Producto',
  service: 'Servicio',
  promotion: 'Promoción',
  discount: 'Descuento',
};

module.exports = {
  formatDay,
  formatInstant,
  formatColones,
  MEMBER_TYPE_LABELS,
  ACCOUNT_STATUS_LABELS,
  WORKDAY_LABELS,
  FREQUENCY_LABELS,
  SUBSCRIBER_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
};
