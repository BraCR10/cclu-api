const mongoose = require('mongoose');

const DATABASE_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function describeDatabaseState(readyState) {
  return DATABASE_STATES[readyState] ?? 'unknown';
}

function getHealthStatus(readyState = mongoose.connection.readyState) {
  const database = describeDatabaseState(readyState);

  return {
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

module.exports = { getHealthStatus, describeDatabaseState };
