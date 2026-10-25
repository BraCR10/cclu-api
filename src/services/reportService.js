const { ERROR_CODES } = require('../config/errorCodes');
const { ValidationError } = require('../config/memberRules');
const { paginated } = require('../config/pagination');
const { toCsv } = require('../config/csv');
const { REPORTS, defaultReportStore } = require('./reports/reportCatalog');
const { readReportFilters, readReportPage } = require('./reports/reportFilters');
const { formatInstant } = require('./reports/reportFormat');
const { renderReportPdf } = require('./reports/reportPdf');

const EXPORT_FORMATS = ['csv', 'pdf'];

function unknownReport() {
  return new ValidationError(
    ERROR_CODES.UNKNOWN_REFERENCE,
    'type',
    'There is no such report.',
    404,
  );
}

function findReport(type) {
  const report = REPORTS.find((entry) => entry.type === type);

  if (report === undefined) {
    throw unknownReport();
  }

  return report;
}

// What the screen offers: every report the chamber asked for, with the filters
// each one takes. Every one of them reads data that exists.
function listReports() {
  return {
    items: REPORTS.map(({ type, title, filters }) => ({ type, title, filters, available: true })),
  };
}

// Only the filters a report takes reach it, so one chosen for another report
// cannot narrow this one without the screen showing it.
function filtersFor(report, query) {
  const filters = readReportFilters(query);

  return Object.fromEntries(
    Object.entries(filters).map(([name, value]) => [
      name,
      report.filters.includes(name) ? value : null,
    ]),
  );
}

async function buildReport(type, query, now, store) {
  const report = findReport(type);
  const { summary, rows } = await report.load(filtersFor(report, query), now, store);

  return {
    type: report.type,
    title: report.title,
    generatedAt: now.toISOString(),
    description: `Generado el ${formatInstant(now)}`,
    summary,
    columns: report.columns,
    rows,
  };
}

async function readReport(type, query, now, store = defaultReportStore) {
  const pagination = readReportPage(query);
  const { rows, ...report } = await buildReport(type, query, now, store);
  const page = rows.slice(pagination.skip, pagination.skip + pagination.pageSize);

  return { ...report, ...paginated(page, rows.length, pagination) };
}

// The file holds every row the preview pages through, with the same totals.
async function exportReport(type, query, now, store = defaultReportStore) {
  const format = query?.format;

  if (!EXPORT_FORMATS.includes(format)) {
    throw new ValidationError(ERROR_CODES.INVALID_FORMAT, 'format', 'format is csv or pdf.');
  }

  const report = await buildReport(type, query, now, store);
  const name = `reporte-${report.type}.${format}`;

  if (format === 'csv') {
    const totals = report.summary.map((entry) => [entry.label, entry.value]);
    const body = toCsv(
      [report.title],
      [[report.description], ...totals, [], report.columns, ...report.rows],
    );

    return { name, contentType: 'text/csv; charset=utf-8', body };
  }

  return { name, contentType: 'application/pdf', body: await renderReportPdf(report) };
}

module.exports = { listReports, readReport, exportReport };
