const { DateTime } = require('luxon');
const { refuse } = require('../../config/memberRules');
const { ERROR_CODES } = require('../../config/errorCodes');
const { readPagination } = require('../../config/pagination');
const { CHAMBER_TIME_ZONE } = require('../../config/chamberCalendar');
const { MEMBER_TYPES } = require('../../models/Member');
const { ACCOUNT_STATUSES } = require('../../config/accountStatus');
const { PLAN_KEYS } = require('../../models/Plan');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMUM_DISTRICT_LENGTH = 80;
const REPORT_PAGE_SIZE = '10';

function readChoice(query, field, allowed) {
  const value = query?.[field];

  if (value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !allowed.includes(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is one of ${allowed.join(', ')}.`);
  }

  return value;
}

function readReference(query, field) {
  const value = query?.[field];

  if (value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is a catalog identifier.`);
  }

  return value;
}

// A day on the chamber's calendar. "From" opens at its first instant and "to"
// closes at the end of its last, so a range of one day covers that whole day.
function readDay(query, field, edge) {
  const value = query?.[field];

  if (value === undefined || value === '') {
    return null;
  }

  const day =
    typeof value === 'string' && CALENDAR_DAY.test(value)
      ? DateTime.fromISO(value, { zone: CHAMBER_TIME_ZONE })
      : null;

  if (day === null || !day.isValid) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is a day written as YYYY-MM-DD.`);
  }

  return (edge === 'start' ? day.startOf('day') : day.endOf('day')).toJSDate();
}

function readDistrict(query) {
  const value = query?.district;

  if (value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length > MAXIMUM_DISTRICT_LENGTH) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'district is a district name.');
  }

  return value.trim();
}

function readReportFilters(query) {
  const filters = {
    canton: readReference(query, 'canton'),
    district: readDistrict(query),
    plan: readChoice(query, 'plan', Object.values(PLAN_KEYS)),
    memberType: readChoice(query, 'memberType', Object.values(MEMBER_TYPES)),
    activity: readReference(query, 'activity'),
    accountStatus: readChoice(query, 'accountStatus', Object.values(ACCOUNT_STATUSES)),
    from: readDay(query, 'from', 'start'),
    to: readDay(query, 'to', 'end'),
  };

  if (filters.district !== null && filters.canton === null) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'A district is filtered within a canton.');
  }

  if (filters.from !== null && filters.to !== null && filters.from > filters.to) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'to', 'The range ends before it starts.');
  }

  return filters;
}

function readReportPage(query) {
  return readPagination({ pageSize: REPORT_PAGE_SIZE, ...query });
}

module.exports = { readReportFilters, readReportPage };
