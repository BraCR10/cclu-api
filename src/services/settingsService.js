const mongoose = require('mongoose');
const {
  MembershipPolicy,
  MEMBERSHIP_POLICY_KEY,
  NOTICE_DAYS,
} = require('../models/MembershipPolicy');
const { Admin } = require('../models/Admin');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { ValidationError, refuse } = require('../config/memberRules');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

const DUPLICATE_KEY = 11000;
const FIELD = 'expiryNoticeDays';

function present(noticeDays) {
  return {
    expiryNoticeDays: noticeDays,
    minimum: NOTICE_DAYS.MINIMUM,
    maximum: NOTICE_DAYS.MAXIMUM,
  };
}

const defaultPolicyStore = {
  findPolicy: () => MembershipPolicy.findOne({ key: MEMBERSHIP_POLICY_KEY }).lean(),
  findAdmin: (id) => Admin.findById(id).select('name email').lean(),

  // The value and its history entry are written together or not at all. The
  // filter carries the value this administrator saw, so a change saved by
  // someone else in between is not overwritten. A policy never seeded is
  // created by the same write.
  applyChange: (previous, next, actor) =>
    mongoose.connection.transaction(async (session) => {
      let policy;

      try {
        policy = await MembershipPolicy.findOneAndUpdate(
          { key: MEMBERSHIP_POLICY_KEY, [FIELD]: previous },
          { $set: { [FIELD]: next } },
          { upsert: true, returnDocument: 'after', runValidators: true, session },
        );
      } catch (error) {
        // The upsert found no document holding the value seen, and the unique
        // key refused a second one: someone else changed it first.
        if (error.code === DUPLICATE_KEY) {
          throw new ApplicationError(
            ERROR_CODES.CHANGED_MEANWHILE,
            'Another administrator changed this value first.',
            { statusCode: 409, field: FIELD },
          );
        }

        throw error;
      }

      await AuditEntry.insertMany(
        [
          {
            action: AUDIT_ACTIONS.MEMBERSHIP_NOTICE_CHANGED,
            actor,
            subject: { type: 'MembershipPolicy', id: policy._id, label: 'Aviso de vencimiento' },
            changes: [{ field: FIELD, before: previous, after: next }],
          },
        ],
        { session },
      );
    }),
};

// The notice in force. A policy that was never seeded reads as the default, so
// reminders and the panel keep working before anyone sets it.
async function readNoticeDays(store = defaultPolicyStore) {
  const policy = await store.findPolicy();

  return Number.isInteger(policy?.[FIELD]) ? policy[FIELD] : NOTICE_DAYS.DEFAULT;
}

async function readPolicy(store = defaultPolicyStore) {
  return present(await readNoticeDays(store));
}

function readRequestedDays(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, FIELD, 'The notice is missing.');
  }

  const value = body[FIELD];

  if (value === undefined || value === null) {
    refuse(ERROR_CODES.REQUIRED, FIELD, 'The notice is required.');
  }

  if (!Number.isInteger(value) || value < NOTICE_DAYS.MINIMUM || value > NOTICE_DAYS.MAXIMUM) {
    refuse(
      ERROR_CODES.INVALID_FORMAT,
      FIELD,
      `The notice is a whole number of days from ${NOTICE_DAYS.MINIMUM} to ${NOTICE_DAYS.MAXIMUM}.`,
    );
  }

  return value;
}

async function changeNoticeDays(identity, body, store = defaultPolicyStore) {
  const next = readRequestedDays(body);
  const previous = await readNoticeDays(store);

  if (next === previous) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, FIELD, 'The notice already has that value.');
  }

  const admin = await store.findAdmin(identity.id);

  if (admin === null || admin === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  const actor = { id: admin._id, role: identity.role, name: admin.name || admin.email };

  await store.applyChange(previous, next, actor);

  return present(next);
}

module.exports = { readNoticeDays, readPolicy, changeNoticeDays };
