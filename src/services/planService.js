const mongoose = require('mongoose');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { Admin } = require('../models/Admin');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { ValidationError, refuse } = require('../config/memberRules');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');

// A ceiling well above any fee the chamber charges, so a mistyped extra zero
// is refused instead of being billed.
const MAXIMUM_MONTHLY_FEE = 1_000_000;

function present(plan) {
  return {
    key: plan.key,
    name: plan.name,
    monthlyFee: plan.monthlyFee,
    entitlements: { ...plan.entitlements },
  };
}

async function listPlans(find = () => Plan.find().sort({ position: 1 }).lean()) {
  return (await find()).map(present);
}

// Every key is checked before anything is written, so a request that names
// one bad plan changes none of them.
function readFees(body) {
  const fees = body?.fees;

  if (fees === null || typeof fees !== 'object' || Array.isArray(fees)) {
    refuse(ERROR_CODES.BODY_MISSING, 'fees', 'The fees are missing.');
  }

  const entries = Object.entries(fees);

  if (entries.length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, 'fees', 'No fee was sent.');
  }

  const knownKeys = new Set(Object.values(PLAN_KEYS));

  for (const [key, fee] of entries) {
    const field = `fees.${key}`;

    if (!knownKeys.has(key)) {
      refuse(ERROR_CODES.UNKNOWN_REFERENCE, field, `There is no plan ${key}.`);
    }

    if (key === PLAN_KEYS.FREE) {
      refuse(ERROR_CODES.NOT_ALLOWED, field, 'Gratuita is always free.');
    }

    if (!Number.isInteger(fee) || fee <= 0 || fee > MAXIMUM_MONTHLY_FEE) {
      refuse(ERROR_CODES.INVALID_FORMAT, field, 'A fee is whole colones above zero.');
    }
  }

  return new Map(entries);
}

function feeChangesFor(plans, fees) {
  return plans
    .filter((plan) => fees.has(plan.key) && fees.get(plan.key) !== plan.monthlyFee)
    .map((plan) => ({ plan, previousFee: plan.monthlyFee, newFee: fees.get(plan.key) }));
}

function auditEntryFor({ plan, previousFee, newFee }, actor) {
  return {
    action: AUDIT_ACTIONS.PLAN_FEE_CHANGED,
    actor,
    subject: { type: 'Plan', id: plan._id, label: plan.name },
    changes: [{ field: 'monthlyFee', before: previousFee, after: newFee }],
  };
}

const defaultFeeStore = {
  findPlans: () => Plan.find().sort({ position: 1 }).lean(),
  findAdmin: (id) => Admin.findById(id).select('name email').lean(),

  // The fee and its history entry are written together or not at all. A fee
  // that changed without a trace is exactly what the history exists to rule
  // out.
  applyFeeChanges: (changes, actor) =>
    mongoose.connection.transaction(async (session) => {
      for (const change of changes) {
        // Matched on the fee this administrator saw, so a change saved by
        // someone else in between is not overwritten and never logged with the
        // wrong previous amount. Throwing here undoes the whole transaction.
        const { matchedCount } = await Plan.updateOne(
          { _id: change.plan._id, monthlyFee: change.previousFee },
          { $set: { monthlyFee: change.newFee } },
          { session },
        );

        if (matchedCount === 0) {
          throw new ApplicationError(
            ERROR_CODES.CHANGED_MEANWHILE,
            'Another administrator changed this fee first.',
            { statusCode: 409, field: `fees.${change.plan.key}` },
          );
        }
      }

      await AuditEntry.insertMany(
        changes.map((change) => auditEntryFor(change, actor)),
        { session },
      );
    }),
};

async function changeFees(identity, body, store = defaultFeeStore) {
  const fees = readFees(body);
  const changes = feeChangesFor(await store.findPlans(), fees);

  if (changes.length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, 'fees', 'Every fee already has that amount.');
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

  await store.applyFeeChanges(changes, actor);

  return listPlans(store.findPlans);
}

function presentFeeChange(entry, keysById) {
  const [change] = entry.changes;

  return {
    id: String(entry._id),
    occurredAt: entry.occurredAt,
    plan: { key: keysById.get(String(entry.subject.id)) ?? null, name: entry.subject.label },
    previousFee: change.before,
    newFee: change.after,
    changedBy: entry.actor.name,
  };
}

const FEE_CHANGES = { action: AUDIT_ACTIONS.PLAN_FEE_CHANGED };

const defaultFeeChangeStore = {
  findEntries: ({ skip, pageSize }) =>
    AuditEntry.find(FEE_CHANGES).sort({ occurredAt: -1 }).skip(skip).limit(pageSize).lean(),
  countEntries: () => AuditEntry.countDocuments(FEE_CHANGES),
  findPlans: () => Plan.find().select('key').lean(),
};

async function listFeeChanges(query, store = defaultFeeChangeStore) {
  const pagination = readPagination(query);
  const [entries, total, plans] = await Promise.all([
    store.findEntries(pagination),
    store.countEntries(),
    store.findPlans(),
  ]);
  const keysById = new Map(plans.map((plan) => [String(plan._id), plan.key]));

  return paginated(
    entries.map((entry) => presentFeeChange(entry, keysById)),
    total,
    pagination,
  );
}

module.exports = {
  MAXIMUM_MONTHLY_FEE,
  listPlans,
  readFees,
  changeFees,
  listFeeChanges,
};
