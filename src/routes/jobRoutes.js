const express = require('express');
const jobController = require('../controllers/jobController');
const { authorize } = require('../middlewares/authorize');
const { requirePaidMembership } = require('../middlewares/requirePaidMembership');
const { ROLES } = require('../config/roles');

const jobRoutes = express.Router();

// Reading a posting is public and lives in publicRoutes; publishing one takes
// the paid membership (CA-EMP-001-02), and is always scoped to the member who
// is signed in, so none of these paths collide with the public GETs.
jobRoutes.post('/', authorize(ROLES.MEMBER), requirePaidMembership(), jobController.create);
jobRoutes.patch('/:id', authorize(ROLES.MEMBER), requirePaidMembership(), jobController.update);
jobRoutes.delete('/:id', authorize(ROLES.MEMBER), requirePaidMembership(), jobController.close);

module.exports = { jobRoutes };
