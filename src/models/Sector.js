const mongoose = require('mongoose');

const sectorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const Sector = mongoose.model('Sector', sectorSchema);

module.exports = { Sector };
