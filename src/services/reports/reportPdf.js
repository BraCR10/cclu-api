const path = require('node:path');
const PDFDocument = require('pdfkit');

// Bundled because neither the standard PDF fonts nor the project's typeface
// carry the colón sign.
const FONT = path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');
const MARGIN = 36;
const CELL_PADDING = 4;
const COLORS = { text: '#13212c', muted: '#62707b', line: '#e1e7eb', header: '#edf2f5' };

function drawHeaderRow(document, columns, widths, top) {
  const height = 18;
  let left = MARGIN;

  document
    .rect(
      MARGIN,
      top,
      widths.reduce((sum, width) => sum + width, 0),
      height,
    )
    .fill(COLORS.header);
  document.fillColor(COLORS.muted).fontSize(8);

  columns.forEach((column, index) => {
    document.text(column, left + CELL_PADDING, top + 5, {
      width: widths[index] - CELL_PADDING * 2,
    });
    left += widths[index];
  });

  return top + height;
}

function rowHeight(document, row, widths) {
  return (
    Math.max(
      ...row.map((cell, index) =>
        document.heightOfString(cell, { width: widths[index] - CELL_PADDING * 2 }),
      ),
    ) +
    CELL_PADDING * 2
  );
}

// A report as a document: its title, what it was filtered by, its totals and
// every row, breaking across pages with the column names repeated.
function renderReportPdf({ title, description, summary, columns, rows }) {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN });
  const chunks = [];
  const usable = document.page.width - MARGIN * 2;
  const widths = columns.map(() => usable / columns.length);
  const bottom = document.page.height - MARGIN;

  document.on('data', (chunk) => chunks.push(chunk));
  document.font(FONT);

  document.fillColor(COLORS.text).fontSize(16).text(title);
  document.fillColor(COLORS.muted).fontSize(9).text(description).moveDown(0.6);
  document
    .fillColor(COLORS.text)
    .fontSize(10)
    .text(summary.map((entry) => `${entry.label}: ${entry.value}`).join('    '))
    .moveDown(0.8);

  let top = drawHeaderRow(document, columns, widths, document.y);
  document.fontSize(9);

  for (const row of rows) {
    const height = rowHeight(document, row, widths);

    if (top + height > bottom) {
      document.addPage();
      top = drawHeaderRow(document, columns, widths, MARGIN);
      document.fontSize(9);
    }

    let left = MARGIN;
    document.fillColor(COLORS.text);
    row.forEach((cell, index) => {
      document.text(cell, left + CELL_PADDING, top + CELL_PADDING, {
        width: widths[index] - CELL_PADDING * 2,
      });
      left += widths[index];
    });
    top += height;
    document
      .moveTo(MARGIN, top)
      .lineTo(MARGIN + usable, top)
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .stroke();
  }

  return new Promise((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.end();
  });
}

module.exports = { renderReportPdf };
