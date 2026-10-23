const mongoose = require('mongoose');

const PUBLICATION_TYPES = Object.freeze({
  PRODUCT: 'product',
  SERVICE: 'service',
  PROMOTION: 'promotion',
  DISCOUNT: 'discount',
});

// A publication is shown while it is active. The chamber can take one down from
// moderation, which keeps it and its reason; a member deleting one sets a date,
// so the reports still count what was published.
const PUBLICATION_STATUSES = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

const publicationSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    type: { type: String, required: true, enum: Object.values(PUBLICATION_TYPES) },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    // What a product or a service costs. A promotion or a discount says what it
    // takes off instead, so it carries no price of its own.
    price: { type: Number, default: null },
    imageFileKey: { type: String, trim: true },
    // What the marketplace groups it under, from the same catalog as the trade.
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', default: null },
    // A discount says how much and on what condition; a promotion says when.
    percentage: { type: Number, default: null },
    condition: { type: String, trim: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: Object.values(PUBLICATION_STATUSES),
      default: PUBLICATION_STATUSES.ACTIVE,
    },
    inactiveReason: { type: String, trim: true, default: null },
    publishedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

// The marketplace lists by type and category, newest first, and the member's own
// screen lists by type as well.
publicationSchema.index({ status: 1, type: 1, removedAt: 1, publishedAt: -1 });
publicationSchema.index({ member: 1, removedAt: 1, publishedAt: -1 });

const Publication = mongoose.model('Publication', publicationSchema);

module.exports = { Publication, PUBLICATION_TYPES, PUBLICATION_STATUSES };
