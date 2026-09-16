const mongoose = require('mongoose');

const DATABASE_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function getHealthStatus() {
  const databaseState = DATABASE_STATES[mongoose.connection.readyState] ?? 'unknown';

  return {
    status: databaseState === 'connected' ? 'ok' : 'degraded',
    database: databaseState,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

module.exports = { getHealthStatus };
