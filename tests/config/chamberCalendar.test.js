const test = require('node:test');
const assert = require('node:assert/strict');
const {
  expiryFrom,
  lastValidDay,
  latestTrustedExpiry,
} = require('../../src/config/chamberCalendar');

// Costa Rica is six hours behind UTC all year, so a Costa Rican midnight is
// 06:00 UTC on the same date.

test('a month approved mid afternoon is valid through the same day next month', () => {
  const approvedAt = new Date('2026-10-17T21:40:00Z');
  const expiresAt = expiryFrom(approvedAt, 'monthly');

  assert.equal(expiresAt.toISOString(), '2026-11-18T06:00:00.000Z');
  assert.equal(lastValidDay(expiresAt), '2026-11-17');
});

test('the day counted is the Costa Rican one, not the UTC one', () => {
  // 02:30 UTC on the 18th is still the evening of the 17th in Costa Rica.
  const approvedAt = new Date('2026-10-18T02:30:00Z');

  assert.equal(lastValidDay(expiryFrom(approvedAt, 'monthly')), '2026-11-17');
});

test('a month from the 31st of January ends on the last day of February', () => {
  const approvedAt = new Date('2027-01-31T15:00:00Z');

  assert.equal(lastValidDay(expiryFrom(approvedAt, 'monthly')), '2027-02-28');
});

test('each frequency adds its own number of months', () => {
  const approvedAt = new Date('2026-10-17T15:00:00Z');

  assert.equal(lastValidDay(expiryFrom(approvedAt, 'quarterly')), '2027-01-17');
  assert.equal(lastValidDay(expiryFrom(approvedAt, 'semiannual')), '2027-04-17');
  assert.equal(lastValidDay(expiryFrom(approvedAt, 'annual')), '2027-10-17');
});

test('a frequency outside the list or an unreadable date is refused', () => {
  const approvedAt = new Date('2026-10-17T15:00:00Z');

  assert.throws(() => expiryFrom(approvedAt, 'forever'), TypeError);
  assert.throws(() => expiryFrom(approvedAt, '__proto__'), TypeError);
  assert.throws(() => expiryFrom(approvedAt, 1), TypeError);
  assert.throws(() => expiryFrom(new Date('not a date'), 'monthly'), TypeError);
  assert.throws(() => expiryFrom('2026-10-17', 'monthly'), TypeError);
});

test('the longest legitimate term stays within the trusted ceiling', () => {
  const approvedAt = new Date('2026-10-17T15:00:00Z');

  assert.ok(expiryFrom(approvedAt, 'annual') <= latestTrustedExpiry(approvedAt));
});
