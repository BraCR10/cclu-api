const path = require('node:path');

// Every value in a message comes from a person: a business name someone typed
// when registering, a reason an administrator wrote. None of it may become
// markup, so the layout escapes everything it is given and templates pass plain
// text only.
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const SIGNATURE = 'Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión';
const CONTACT = { whatsapp: '6128 2812', email: 'info@camaralaunion.com' };

// The brand, as the web shows it. Mail clients ignore stylesheets and most
// modern CSS, so every style is written on its element.
const COLORS = {
  brand: '#0b5a8a',
  canvas: '#f3f6f8',
  surface: '#ffffff',
  subtle: '#f7f9fb',
  line: '#e3e8ec',
  text: '#13212c',
  muted: '#5b6b77',
};
const FONT = "'Red Hat Text', 'Segoe UI', Arial, Helvetica, sans-serif";

const CALENDAR_DAY = new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'UTC' });
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

// A day on the chamber's calendar, given as YYYY-MM-DD. Formatted from its own
// parts in UTC so no time zone can move it to the day before.
function formatCalendarDay(isoDate) {
  const [, year, month, day] = ISO_DATE.exec(isoDate) ?? [];

  if (year === undefined) {
    throw new TypeError(`${isoDate} is not a calendar day.`);
  }

  return CALENDAR_DAY.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

function webOrigin(environment = process.env) {
  return (environment.WEB_ORIGIN || '').replace(/\/+$/, '');
}

// A page of the web, for the button a message leads to. Built from the
// configured origin, never from anything a person sent.
function webUrl(path) {
  const origin = webOrigin();

  return origin === '' ? undefined : `${origin}${path}`;
}

// The logo travels inside the message, referenced by its content id, so it
// shows wherever the web is hosted, or before it is hosted anywhere.
const LOGO = {
  filename: 'cclu-logo.png',
  path: path.join(__dirname, 'assets', 'cclu-logo.png'),
  cid: 'cclu-logo',
  contentDisposition: 'inline',
};

function logoBlock() {
  return `<img src="cid:${LOGO.cid}" width="150" alt="${escapeHtml('Cámara de Comercio de La Unión')}" style="display:block;width:150px;max-width:150px;height:auto;border:0;">`;
}

function paragraphBlock(text) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.text};">${escapeHtml(text)}</p>`;
}

// Longer than this, a value reads better under its label than beside it.
const SHORT_VALUE_LENGTH = 28;

function detailRow({ label, value, highlight = false }, index, stacked) {
  const border = index === 0 ? '0' : `1px solid ${COLORS.line}`;
  const text = String(value);

  if (stacked) {
    return `<tr><td colspan="2" style="padding:12px 16px;border-top:${border};">
<p style="margin:0 0 4px;font-family:${FONT};font-size:13px;color:${COLORS.muted};">${escapeHtml(label)}</p>
<p style="margin:0;font-family:${FONT};font-size:15px;line-height:22px;color:${COLORS.text};">${escapeHtml(text)}</p>
</td></tr>`;
  }

  return `<tr>
<td style="padding:10px 16px;font-family:${FONT};font-size:13px;color:${COLORS.muted};border-top:${border};">${escapeHtml(label)}</td>
<td align="right" style="padding:10px 16px;font-family:${FONT};font-size:${highlight ? '20px' : '15px'};font-weight:700;color:${COLORS.text};border-top:${border};">${escapeHtml(text)}</td>
</tr>`;
}

// The facts the message is about, as label and value. A highlighted value, such
// as a member code, is shown larger. One long value stacks the whole table, so
// its rows stay aligned with each other.
function detailsBlock(details) {
  const stacked = details.some(({ value }) => String(value).length > SHORT_VALUE_LENGTH);
  const rows = details.map((detail, index) => detailRow(detail, index, stacked)).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:${COLORS.subtle};border:1px solid ${COLORS.line};border-radius:8px;border-collapse:separate;">${rows}</table>`;
}

// A table-built button, so it is a button in Outlook as well.
function actionBlock({ label, url }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
<td style="border-radius:6px;background:${COLORS.brand};">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function noteBlock(text) {
  return `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(text)}</p>`;
}

function footerBlock() {
  return `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">${escapeHtml(SIGNATURE)}</p>
<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">WhatsApp ${escapeHtml(CONTACT.whatsapp)} · ${escapeHtml(CONTACT.email)}</p>
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">${escapeHtml('Este es un correo automático; no hace falta responderlo.')}</p>`;
}

// One message: a heading, a few short paragraphs, the facts it is about, the
// one thing to do next and a note. Every part but the heading is optional.
function renderEmail({ preheader, heading, paragraphs = [], details = [], action, note }) {
  const body = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${COLORS.text};">${escapeHtml(heading)}</h1>`,
    ...paragraphs.map(paragraphBlock),
    details.length === 0 ? '' : detailsBlock(details),
    action === undefined || action.url === undefined ? '' : actionBlock(action),
    note === undefined ? '' : noteBlock(note),
  ].join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader ?? heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.surface};border-radius:12px;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:4px solid ${COLORS.brand};">${logoBlock()}</td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:20px 32px;text-align:center;">${footerBlock()}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// The plain version every message carries for clients without HTML.
function renderText({ paragraphs = [], details = [], action, note }) {
  return [
    ...paragraphs,
    details.length === 0
      ? null
      : details.map(({ label, value }) => `${label}: ${value}`).join('\n'),
    action === undefined || action.url === undefined ? null : `${action.label}: ${action.url}`,
    note ?? null,
    SIGNATURE,
  ]
    .filter((part) => part !== null)
    .join('\n\n');
}

// A template describes its message once and gets both versions.
function composeEmail(subject, content) {
  return {
    subject,
    text: renderText(content),
    html: renderEmail(content),
    attachments: [LOGO],
  };
}

module.exports = { composeEmail, escapeHtml, formatCalendarDay, webUrl, SIGNATURE };
