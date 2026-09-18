const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const { readCookies } = require('./middlewares/readCookies');
const { verifyOrigin } = require('./middlewares/verifyOrigin');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// The session travels in a cookie, so the browser only sends it when the
// response names this exact origin. A wildcard cannot carry credentials.
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(readCookies);
app.use(verifyOrigin);

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
