const mongoose = require('mongoose');

const SUBSCRIBER_STATUSES = Object.freeze({
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
});

// Somebody who asked to receive the chamber's promotions. Leaving keeps the row
// with its date, so the chamber can show it honoured the request.
const subscriberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    whatsappNumber: { type: String, trim: true },
    canton: { type: mongoose.Schema.Types.ObjectId, ref: 'Canton', required: true },
    district: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(SUBSCRIBER_STATUSES),
      default: SUBSCRIBER_STATUSES.SUBSCRIBED,
    },
    // The consent the law asks for, with when it was given.
    consentedAt: { type: Date, required: true },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

subscriberSchema.index({ status: 1, createdAt: -1 });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

module.exports = { Subscriber, SUBSCRIBER_STATUSES };
