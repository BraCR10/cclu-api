const test = require('node:test');
const assert = require('node:assert/strict');
const notFoundHandler = require('../../src/middlewares/notFoundHandler');

test('an unknown route answers 404 with the route_not_found code', () => {
  const sent = {};
  const response = {
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
  };

  notFoundHandler({ method: 'GET', originalUrl: '/nowhere' }, response);

  assert.equal(sent.status, 404);
  assert.equal(sent.body.code, 'route_not_found');
});
