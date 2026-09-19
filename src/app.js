const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const { publicAuthRoutes, privateAuthRoutes } = require('./routes/authRoutes');
const { publicRoutes } = require('./routes/publicRoutes');
const { adminRoutes } = require('./routes/adminRoutes');
const { readCookies } = require('./middlewares/readCookies');
const { verifyOrigin } = require('./middlewares/verifyOrigin');
const { authenticate } = require('./middlewares/authenticate');
const { requireActiveAccount } = require('./middlewares/requireActiveAccount');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Declared rather than guessed. Behind a proxy the rate limiter sees the
// proxy's address for everyone, and one shared bucket locks out the lot.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

// The session travels in a cookie, so the browser only sends it when the
// response names this exact origin. A wildcard cannot carry credentials.
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(readCookies);
app.use(verifyOrigin);

// Infrastructure, not domain. Deployment checks it without a session.
app.use('/health', healthRoutes);

// Everything deliberately open to the public is mounted above the gate, where
// a reader can see the whole list at once.
app.use('/api/auth', publicAuthRoutes);
app.use('/api', publicRoutes);

// The gate. Every route registered below it requires a valid session and an
// account that still works, so forgetting to protect one leaves it protected
// rather than open. Making a route public is an edit above this line, which is
// a deliberate act that shows up in a diff.
app.use('/api', authenticate, requireActiveAccount);

app.use('/api/auth', privateAuthRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
