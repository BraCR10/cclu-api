const mongoose = require('mongoose');

const cantonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    province: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const Canton = mongoose.model('Canton', cantonSchema);

module.exports = { Canton };
