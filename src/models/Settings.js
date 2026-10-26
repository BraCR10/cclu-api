const mongoose = require('mongoose');

// The chamber's settings are one document, the way a CMS keeps its globals:
// each setting is a typed, validated field, and changing several at once is a
// single atomic write. settingsService is the only writer and keeps it to one.

// At most 27 days, one less than the shortest month. The renewal window opens
// this many days before an expiry, and a renewal adds a month; were the notice
// longer than a month, the next window would already be open when the renewal
// is approved, and one term could be paid for twice.
const NOTICE_DAYS = Object.freeze({ DEFAULT: 7, MINIMUM: 1, MAXIMUM: 27 });

const settingsSchema = new mongoose.Schema(
  {
    // How many days before an expiry the member is reminded, the renewal window
    // opens and the panel lists the plan as expiring soon. One value, so the
    // three never disagree.
    expiryNoticeDays: {
      type: Number,
      required: true,
      min: NOTICE_DAYS.MINIMUM,
      max: NOTICE_DAYS.MAXIMUM,
      validate: { validator: Number.isInteger, message: 'The notice is whole days.' },
    },
  },
  { timestamps: true, collection: 'settings' },
);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = { Settings, NOTICE_DAYS };
