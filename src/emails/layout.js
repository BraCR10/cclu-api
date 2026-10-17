// Every value in a message comes from a person: a business name someone typed
// when registering, a reason an administrator wrote. None of it may become
// markup.
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const SIGNATURE = 'Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión';

const CALENDAR_DAY = new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'UTC' });
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A day on the chamber's calendar, given as YYYY-MM-DD. Formatted from its own
// parts in UTC so no time zone can move it to the day before.
function formatCalendarDay(isoDate) {
  const [, year, month, day] = ISO_DATE.exec(isoDate) ?? [];

  if (year === undefined) {
    throw new TypeError(`${isoDate} is not a calendar day.`);
  }

  return CALENDAR_DAY.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

// Paragraphs arrive already escaped, because each template decides which parts
// of its own text are markup it wrote and which are values it received.
function layout(heading, paragraphs) {
  const body = paragraphs.map((text) => `<p>${text}</p>`).join('');

  return `<div><h2>${escapeHtml(heading)}</h2>${body}<p>${SIGNATURE}</p></div>`;
}

module.exports = { layout, escapeHtml, formatCalendarDay, SIGNATURE };
