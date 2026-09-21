const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      min: 0,
    },
    category: {
      type: String,
      trim: true,
    },
    // Set only once an image has gone through the upload endpoint, the same
    // arrangement as Member.logoKey: a signed address is computed fresh on
    // every read, never saved, because a signed address expires.
    imageKey: {
      type: String,
      trim: true,
    },
    // Published content under BD-003 is kept permanently: closing a listing
    // turns this off rather than removing the record.
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

listingSchema.index({ member: 1 });
listingSchema.index({ isActive: 1, createdAt: -1 });

const Listing = mongoose.model('Listing', listingSchema);

module.exports = { Listing };
