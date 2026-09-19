const express = require('express');
const memberController = require('../controllers/memberController');
const catalogController = require('../controllers/catalogController');

const publicRoutes = express.Router();

// Registration is open by definition: nobody has an account yet.
publicRoutes.post('/members', memberController.signUp);

// The form cannot offer a canton or a sector without first knowing which exist.
publicRoutes.get('/cantons', catalogController.getCantons);
publicRoutes.get('/sectors', catalogController.getSectors);

module.exports = { publicRoutes };
