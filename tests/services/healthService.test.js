const test = require('node:test');
const assert = require('node:assert/strict');
const { getHealthStatus, describeDatabaseState } = require('../../src/services/healthService');

test('describeDatabaseState names every state Mongoose reports', () => {
  assert.equal(describeDatabaseState(0), 'disconnected');
  assert.equal(describeDatabaseState(1), 'connected');
  assert.equal(describeDatabaseState(2), 'connecting');
  assert.equal(describeDatabaseState(3), 'disconnecting');
});

test('describeDatabaseState falls back to unknown for a state it does not recognise', () => {
  assert.equal(describeDatabaseState(99), 'unknown');
  assert.equal(describeDatabaseState(undefined), 'unknown');
});

test('getHealthStatus reports ok only while the database is connected', () => {
  assert.equal(getHealthStatus(1).status, 'ok');
});

test('getHealthStatus reports degraded for every state other than connected', () => {
  assert.equal(getHealthStatus(0).status, 'degraded');
  assert.equal(getHealthStatus(2).status, 'degraded');
  assert.equal(getHealthStatus(3).status, 'degraded');
  assert.equal(getHealthStatus(99).status, 'degraded');
});

test('getHealthStatus exposes the database state it based its answer on', () => {
  assert.equal(getHealthStatus(1).database, 'connected');
  assert.equal(getHealthStatus(0).database, 'disconnected');
});

test('getHealthStatus reports uptime as a whole number of seconds', () => {
  const { uptimeSeconds } = getHealthStatus(1);

  assert.equal(Number.isInteger(uptimeSeconds), true);
  assert.equal(uptimeSeconds >= 0, true);
});
