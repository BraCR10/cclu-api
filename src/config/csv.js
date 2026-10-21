// A spreadsheet runs a cell that starts with one of these as a formula, so a
// value someone typed, such as a name, could run on the chamber's computer.
// Prefixing an apostrophe keeps it text.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;

  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// A byte order mark first, so Excel opens the accents as UTF-8.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

function toCsv(header, rows) {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));

  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, toCsv };
