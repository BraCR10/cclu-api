const mongoose = require('mongoose');

const AUDIT_ACTIONS = {
  PLAN_FEE_CHANGED: 'plan.fee_changed',
};

// Who acted, copied at the moment of the action. A history that joined to the
// live account would rewrite itself when an administrator changes their name.
const actorSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const subjectSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

// One collection for every action the chamber has to answer for later, each
// entry a fact that already happened. Entries are only ever inserted.
const auditEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTIONS),
    },
    actor: { type: actorSchema, required: true },
    subject: { type: subjectSchema, required: true },
    changes: { type: [changeSchema], default: [] },
  },
  {
    timestamps: { createdAt: 'occurredAt', updatedAt: false },
    versionKey: false,
  },
);

auditEntrySchema.index({ action: 1, occurredAt: -1 });
auditEntrySchema.index({ 'subject.type': 1, 'subject.id': 1, occurredAt: -1 });

const REWRITING_OPERATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

function refuseRewrite() {
  throw new Error('Audit entries are append-only.');
}

// The application cannot rewrite history by accident. A database user limited
// to find and insert on this collection is what stops it on purpose.
auditEntrySchema.pre(REWRITING_OPERATIONS, { document: true, query: true }, refuseRewrite);

auditEntrySchema.pre('save', function refuseResave() {
  if (!this.isNew) {
    refuseRewrite();
  }
});

const AuditEntry = mongoose.model('AuditEntry', auditEntrySchema);

module.exports = { AuditEntry, AUDIT_ACTIONS };
