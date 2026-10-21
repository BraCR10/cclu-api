const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

// What happened, as an identifier the web turns into a sentence. The API never
// writes the sentence, so the wording can change without touching stored rows.
const NOTIFICATION_TYPES = Object.freeze({
  APPLICATION_SUBMITTED: 'application_submitted',
  APPLICATION_RESUBMITTED: 'application_resubmitted',
  PAYMENT_SUBMITTED: 'payment_submitted',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
  MEMBERSHIP_EXPIRING: 'membership_expiring',
  MEMBERSHIP_LAPSED: 'membership_lapsed',
});

// One row per person, so each one reads it on their own. A notice for the
// panel is copied to every active administrator when it happens.
const notificationSchema = new mongoose.Schema(
  {
    recipientRole: { type: String, required: true, enum: Object.values(ROLES) },
    recipient: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true, enum: Object.values(NOTIFICATION_TYPES) },
    // The values the sentence names, such as a business or an amount.
    params: { type: Map, of: mongoose.Schema.Types.Mixed, default: () => ({}) },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

notificationSchema.index({ recipientRole: 1, recipient: 1, createdAt: -1 });
notificationSchema.index(
  { recipientRole: 1, recipient: 1 },
  { partialFilterExpression: { readAt: null }, name: 'unread_by_recipient' },
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification, NOTIFICATION_TYPES };
