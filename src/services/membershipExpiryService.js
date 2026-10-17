const mongoose = require('mongoose');
const { Membership } = require('../models/Membership');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { AuditEntry, AUDIT_ACTIONS, SYSTEM_ACTOR } = require('../models/AuditEntry');
const emailService = require('./emailService');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS_AHEAD = 7;

const MEMBER_FIELDS = 'email businessName';

function lapseEntryFor(membership, freePlan) {
  return {
    action: AUDIT_ACTIONS.MEMBERSHIP_LAPSED,
    actor: SYSTEM_ACTOR,
    subject: { type: 'Membership', id: membership._id, label: membership.member.businessName },
    changes: [
      { field: 'plan', before: membership.plan.key, after: freePlan.key },
      { field: 'expiresAt', before: membership.expiresAt, after: null },
    ],
  };
}

const defaultExpiryStore = {
  findFreePlan: () => Plan.findOne({ key: PLAN_KEYS.FREE }).select('key').lean(),

  findExpired: (now, freePlanId) =>
    Membership.find({ plan: { $ne: freePlanId }, expiresAt: { $ne: null, $lte: now } })
      .populate('plan', 'key name')
      .populate('member', MEMBER_FIELDS)
      .lean(),

  // The move and its history entry are written together or not at all. The
  // filter carries the plan and the expiry this run read, so a payment approved
  // in between is not undone, and a second run finds nothing left to move.
  lapse: (membership, freePlan) =>
    mongoose.connection.transaction(async (session) => {
      const { modifiedCount } = await Membership.updateOne(
        { _id: membership._id, plan: membership.plan._id, expiresAt: membership.expiresAt },
        {
          $set: {
            plan: freePlan._id,
            startedAt: membership.expiresAt,
            expiresAt: null,
            reminderSentFor: null,
            lapsed: { plan: membership.plan._id, expiredAt: membership.expiresAt },
          },
        },
        { session },
      );

      if (modifiedCount === 0) {
        return false;
      }

      await AuditEntry.insertMany([lapseEntryFor(membership, freePlan)], { session });

      return true;
    }),

  findExpiring: (now, until) =>
    Membership.find({
      expiresAt: { $gt: now, $lte: until },
      $expr: { $ne: ['$reminderSentFor', '$expiresAt'] },
    })
      .populate('plan', 'key name')
      .populate('member', MEMBER_FIELDS)
      .lean(),

  // Claimed before the message is sent, so two runs at once cannot both send
  // it. The claim names the expiry, so a renewal makes the next one due.
  claimReminder: async (membership) => {
    const { modifiedCount } = await Membership.updateOne(
      {
        _id: membership._id,
        expiresAt: membership.expiresAt,
        reminderSentFor: { $ne: membership.expiresAt },
      },
      { $set: { reminderSentFor: membership.expiresAt } },
    );

    return modifiedCount === 1;
  },

  releaseReminder: (membership) =>
    Membership.updateOne(
      { _id: membership._id, reminderSentFor: membership.expiresAt },
      { $set: { reminderSentFor: null } },
    ),
};

// Moves every paid plan past its expiry back to Gratuita. Safe to run as often
// as wanted: a membership already moved no longer matches.
async function lapseExpiredMemberships(
  now = new Date(),
  store = defaultExpiryStore,
  notify = emailService.notify,
) {
  const freePlan = await store.findFreePlan();

  if (freePlan === null || freePlan === undefined) {
    return 0;
  }

  let lapsed = 0;

  for (const membership of await store.findExpired(now, freePlan._id)) {
    if (!(await store.lapse(membership, freePlan))) {
      continue;
    }

    lapsed += 1;

    // The move stands whether or not the message leaves. The member also finds
    // the notice on their membership screen.
    await notify('membershipLapsed', membership.member.email, {
      businessName: membership.member.businessName,
      planName: membership.plan.name,
    });
  }

  return lapsed;
}

// Reminds each member whose paid plan runs out within the week, once per
// expiry. A message that does not leave releases its claim, so the next run
// tries again instead of the reminder being lost.
async function remindExpiringMemberships(
  now = new Date(),
  store = defaultExpiryStore,
  send = emailService.sendEmail,
) {
  const until = new Date(now.getTime() + REMINDER_DAYS_AHEAD * DAY_IN_MILLISECONDS);
  let reminded = 0;

  for (const membership of await store.findExpiring(now, until)) {
    if (!(await store.claimReminder(membership))) {
      continue;
    }

    try {
      await send('membershipExpiring', membership.member.email, {
        businessName: membership.member.businessName,
        planName: membership.plan.name,
        expiresAt: membership.expiresAt,
      });
      reminded += 1;
    } catch (error) {
      await store.releaseReminder(membership);
      console.error(`Membership reminder not delivered: ${error.message}`);
    }
  }

  return reminded;
}

module.exports = {
  REMINDER_DAYS_AHEAD,
  lapseExpiredMemberships,
  remindExpiringMemberships,
};
