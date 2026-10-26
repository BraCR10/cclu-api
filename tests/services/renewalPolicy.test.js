const test = require('node:test');
const assert = require('node:assert/strict');
const { renewalWindow, termFor } = require('../../src/services/renewalPolicy');
const { lastValidDay } = require('../../src/config/chamberCalendar');

const PRO = { key: 'pro' };
const FREE = { key: 'free' };
// Valid through 17 November in Costa Rica.
const RUNNING = { plan: PRO, expiresAt: new Date('2026-11-18T06:00:00.000Z') };

test('a member on Gratuita may pay at any time', () => {
  assert.equal(
    renewalWindow({ plan: FREE, expiresAt: null }, new Date('2026-10-01'), 7).open,
    true,
  );
  assert.equal(renewalWindow(null, new Date('2026-10-01'), 7).open, true);
});

test('a running plan opens for renewal exactly the notice before it ends, and not a millisecond sooner', () => {
  const opens = new Date('2026-11-11T06:00:00.000Z');

  assert.equal(renewalWindow(RUNNING, new Date(opens.getTime() - 1), 7).open, false);
  assert.equal(renewalWindow(RUNNING, opens, 7).open, true);
  assert.equal(renewalWindow(RUNNING, new Date(opens.getTime() - 1), 7).opensOn, '2026-11-11');
});

test('the window follows the notice the chamber set', () => {
  const now = new Date('2026-11-05T12:00:00.000Z');

  assert.equal(renewalWindow(RUNNING, now, 7).open, false);
  assert.equal(renewalWindow(RUNNING, now, 15).open, true);
});

test('a plan that ran out counts as Gratuita, so it may be paid at once', () => {
  assert.equal(renewalWindow(RUNNING, new Date('2026-11-20T12:00:00.000Z'), 7).open, true);
});

test('renewing a running plan inside the window costs no days', () => {
  const term = termFor(RUNNING, new Date('2026-11-14T15:00:00.000Z'));

  assert.equal(term.startsAt.toISOString(), RUNNING.expiresAt.toISOString());
  assert.equal(lastValidDay(term.expiresAt), '2026-12-17');
});

test('a plan that ran out, or Gratuita, starts its term at the approval', () => {
  const approvedAt = new Date('2026-11-20T15:00:00.000Z');

  assert.equal(termFor(RUNNING, approvedAt).startsAt, approvedAt);
  assert.equal(lastValidDay(termFor(RUNNING, approvedAt).expiresAt), '2026-12-20');
  assert.equal(
    lastValidDay(termFor({ plan: FREE, expiresAt: null }, approvedAt).expiresAt),
    '2026-12-20',
  );
});

test('a renewal from the last day of January ends on the last day of February', () => {
  const endOfJanuary = { plan: PRO, expiresAt: new Date('2027-02-01T06:00:00.000Z') };

  assert.equal(
    lastValidDay(termFor(endOfJanuary, new Date('2027-01-28T12:00:00.000Z')).expiresAt),
    '2027-02-28',
  );
});

// The longest notice is shorter than the shortest month, so approving a renewal
// always closes the window until the next term.
test('a renewal approved in February closes the window even with the longest notice', () => {
  const { MAXIMUM } = require('../../src/models/Settings').NOTICE_DAYS;
  const endOfJanuary = { plan: PRO, expiresAt: new Date('2027-02-01T06:00:00.000Z') };
  const approvedAt = new Date('2027-01-06T12:00:00.000Z');
  const renewed = { plan: PRO, expiresAt: termFor(endOfJanuary, approvedAt).expiresAt };

  assert.equal(renewalWindow(endOfJanuary, approvedAt, MAXIMUM).open, true);
  assert.equal(renewalWindow(renewed, approvedAt, MAXIMUM).open, false);
});
