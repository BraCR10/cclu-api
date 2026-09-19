const { Canton } = require('../models/Canton');
const { Sector } = require('../models/Sector');

// The registration form cannot let someone pick a canton or a sector without
// knowing which exist, and both are closed lists the chamber decides.
function listCantons() {
  return Canton.find().select('name province').sort({ name: 1 }).lean();
}

function listSectors() {
  return Sector.find().select('name').sort({ name: 1 }).lean();
}

module.exports = { listCantons, listSectors };
