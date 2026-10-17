const { layout, escapeHtml, formatCalendarDay } = require('./layout');

// The last valid day, as the chamber's calendar names it.
function paymentApproved({ businessName, planName, validUntil }) {
  const date = formatCalendarDay(validUntil);

  return {
    subject: 'Su pago fue aprobado',
    text: `${businessName}: la Cámara aprobó su pago. Su plan ${planName} está vigente hasta el ${date}.`,
    html: layout('Su pago fue aprobado', [
      `${escapeHtml(businessName)}, la Cámara aprobó su pago.`,
      `Su plan <strong>${escapeHtml(planName)}</strong> está vigente hasta el ${escapeHtml(date)}.`,
    ]),
  };
}

module.exports = { paymentApproved };
