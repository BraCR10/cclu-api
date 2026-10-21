const express = require('express');
const memberController = require('../controllers/memberController');
const catalogController = require('../controllers/catalogController');
const directoryController = require('../controllers/directoryController');
const emailChangeController = require('../controllers/emailChangeController');
const fileController = require('../controllers/fileController');
const memberProfileController = require('../controllers/memberProfileController');
const planController = require('../controllers/planController');
const resubmissionController = require('../controllers/resubmissionController');
const { limitByAddress, limitRegistrations, limitUploads } = require('../middlewares/rateLimits');
const { readUpload } = require('../middlewares/readUpload');

const publicRoutes = express.Router();

// Registration is open by definition: nobody has an account yet.
publicRoutes.post('/members', limitRegistrations, memberController.signUp);

// The form cannot offer a canton or an activity without first knowing which
// exist.
publicRoutes.get('/cantons', catalogController.getCantons);
publicRoutes.get('/activities', catalogController.getActivities);

// A visitor compares the plans before having an account.
publicRoutes.get('/plans', planController.getPlans);

// A registration carries a personería jurídica and a logo before the applicant
// has an account, so storing one is open for the same reason registering is.
// Reading one back needs the key, which is the only thing that opens it.
publicRoutes.post('/files', limitUploads, readUpload, fileController.uploadFile);
publicRoutes.get('/files/:key', fileController.openPublicFile);

// The directory is the chamber's public roll: anybody may search who is
// affiliated. Declared before the profile so "districts" is not read as a code.
publicRoutes.get('/directory', directoryController.getDirectory);
publicRoutes.get('/directory/districts', directoryController.getDistricts);

// The address a card's QR carries. It is a permanent contract: a card already
// issued cannot be reissued, so this path never changes.
publicRoutes.get('/directory/:memberCode', memberProfileController.getPublicProfile);

// Reached by the link a rejection or a request for changes carries. Somebody in
// that position cannot sign in, so requiring a session would shut out the only
// person this exists for; the token is what proves the registration is theirs.
publicRoutes.get('/resubmission/:token', resubmissionController.getCorrectionRequest);
publicRoutes.post('/resubmission/:token', limitRegistrations, resubmissionController.resubmit);

// Reached by the link that confirms a new address. It is read on whichever
// device the message is opened on, which is why it asks for no session: the
// token is the proof that the address belongs to whoever asked to claim it.
publicRoutes.get('/email-change/:token', limitByAddress, emailChangeController.getEmailChange);
publicRoutes.post('/email-change/:token', limitByAddress, emailChangeController.confirmEmailChange);

// Guessing at codes is pointless against a sparse space of thirty three million
// with a check digit, so this carries no limit that a shared address could trip.
module.exports = { publicRoutes };
