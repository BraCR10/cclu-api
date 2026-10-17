const clock = require('../config/clock');
const entitlementService = require('../services/entitlementService');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

// The one place a member's plan is enforced. A route that needs something a
// plan unlocks names it here, and the answer is worked out against the clock on
// every request rather than read from the session, which carries no plan.
//
// A misspelled name throws while the routes are being built, so the server
// refuses to start instead of a route that quietly grants nothing, or
// everything.
function requireEntitlement(
  name,
  readEffectivePlan = entitlementService.readEffectivePlan,
  now = clock.now,
) {
  if (!entitlementService.isEntitlementName(name)) {
    throw new TypeError(`There is no entitlement named ${name}.`);
  }

  return async function checkEntitlement(request, response, next) {
    const plan = await readEffectivePlan(request.identity.id, now());

    if (!entitlementService.grants(plan, name)) {
      throw new ApplicationError(
        ERROR_CODES.PLAN_REQUIRED,
        'The current plan does not include this.',
        {
          statusCode: 403,
          reason: name,
        },
      );
    }

    next();
  };
}

module.exports = { requireEntitlement };
