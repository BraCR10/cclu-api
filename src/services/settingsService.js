const mongoose = require('mongoose');
const { Settings, NOTICE_DAYS } = require('../models/Settings');
const { Admin } = require('../models/Admin');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { ValidationError, refuse } = require('../config/memberRules');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

const FIELD = 'expiryNoticeDays';

function present(noticeDays) {
  return {
    expiryNoticeDays: noticeDays,
    minimum: NOTICE_DAYS.MINIMUM,
    maximum: NOTICE_DAYS.MAXIMUM,
  };
}

function changedMeanwhile() {
  return new ApplicationError(
    ERROR_CODES.CHANGED_MEANWHILE,
    'Another administrator changed this value first.',
    { statusCode: 409, field: FIELD },
  );
}

const defaultSettingsStore = {
  findSettings: () => Settings.findOne().lean(),
  findAdmin: (id) => Admin.findById(id).select('name email').lean(),

  // The value and its history entry are written together or not at all. The
  // filter carries the value this administrator saw, so a change saved by
  // someone else in between is not overwritten. Settings are created here only
  // when the database was never reset, which is what seeds them.
  applyChange: (previous, next, actor) =>
    mongoose.connection.transaction(async (session) => {
      const current = await Settings.findOne().session(session);
      const settings =
        current === null
          ? (await Settings.create([{ [FIELD]: next }], { session }))[0]
          : await Settings.findOneAndUpdate(
              { _id: current._id, [FIELD]: previous },
              { $set: { [FIELD]: next } },
              { returnDocument: 'after', runValidators: true, session },
            );

      if (settings === null) {
        throw changedMeanwhile();
      }

      await AuditEntry.insertMany(
        [
          {
            action: AUDIT_ACTIONS.MEMBERSHIP_NOTICE_CHANGED,
            actor,
            subject: { type: 'Settings', id: settings._id, label: 'Aviso de vencimiento' },
            changes: [{ field: FIELD, before: previous, after: next }],
          },
        ],
        { session },
      );
    }),
};

// The notice in force. Settings that were never seeded read as the default, so
// reminders and the panel keep working before anyone sets it.
async function readNoticeDays(store = defaultSettingsStore) {
  const settings = await store.findSettings();

  return Number.isInteger(settings?.[FIELD]) ? settings[FIELD] : NOTICE_DAYS.DEFAULT;
}

async function readPolicy(store = defaultSettingsStore) {
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

async function changeNoticeDays(identity, body, store = defaultSettingsStore) {
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
