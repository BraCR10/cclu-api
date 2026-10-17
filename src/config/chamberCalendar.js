const { DateTime } = require('luxon');

// Every day the chamber counts is a day in Costa Rica. Named by zone rather
// than by offset, so a change to the country's rules arrives with the time zone
// database instead of a code change.
const CHAMBER_TIME_ZONE = 'America/Costa_Rica';

// A closed list, so a term can only ever be one of these lengths. A number sent
// by anyone is looked up here and never used as it arrives.
const PAYMENT_FREQUENCIES = Object.freeze({
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
});

// One month of slack over the longest term. A plan reaching further than this
// was not written by expiryFrom and is not trusted.
const MAXIMUM_TERM_MONTHS = Math.max(...Object.values(PAYMENT_FREQUENCIES)) + 1;

function isValidInstant(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function inChamberZone(instant) {
  return DateTime.fromJSDate(instant, { zone: CHAMBER_TIME_ZONE });
}

// A plan stays valid through the whole of its last day. Approved on 17 October
// for a month, it is valid through 17 November, so it expires at midnight
// opening the 18th in Costa Rica. The instant returned is that exclusive end:
// access holds while now is before it. Month ends clamp, so 31 January plus a
// month is valid through 28 February.
function expiryFrom(approvedAt, frequency) {
  if (!isValidInstant(approvedAt)) {
    throw new TypeError('The approval instant is not a valid date.');
  }

  if (!Object.hasOwn(PAYMENT_FREQUENCIES, frequency)) {
    throw new TypeError(`There is no payment frequency ${frequency}.`);
  }

  return inChamberZone(approvedAt)
    .plus({ months: PAYMENT_FREQUENCIES[frequency] })
    .startOf('day')
    .plus({ days: 1 })
    .toJSDate();
}

// The last day the plan is valid, as the chamber writes it. Shown instead of
// the expiry itself, which falls on the following day.
function lastValidDay(expiresAt) {
  if (!isValidInstant(expiresAt)) {
    return null;
  }

  return inChamberZone(expiresAt).minus({ milliseconds: 1 }).toISODate();
}

// The day an instant falls on in Costa Rica, as YYYY-MM-DD.
function calendarDayOf(instant) {
  return isValidInstant(instant) ? inChamberZone(instant).toISODate() : null;
}

// The latest expiry a plan can legitimately carry at this moment.
function latestTrustedExpiry(now) {
  return inChamberZone(now)
    .plus({ months: MAXIMUM_TERM_MONTHS })
    .startOf('day')
    .plus({ days: 1 })
    .toJSDate();
}

module.exports = {
  CHAMBER_TIME_ZONE,
  PAYMENT_FREQUENCIES,
  MAXIMUM_TERM_MONTHS,
  isValidInstant,
  expiryFrom,
  lastValidDay,
  latestTrustedExpiry,
  calendarDayOf,
};
