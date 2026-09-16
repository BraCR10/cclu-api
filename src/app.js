const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/health', healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
