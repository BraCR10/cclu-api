const {
  lapseExpiredMemberships,
  remindExpiringMemberships,
} = require('../services/membershipExpiryService');

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

async function runMembershipExpiry(now = new Date()) {
  const lapsed = await lapseExpiredMemberships(now);
  const reminded = await remindExpiringMemberships(now);

  return { lapsed, reminded };
}

// Hourly rather than daily, inside the API rather than in the host's cron: the
// work is safe to repeat, so a restart, a second instance or a missed hour only
// means it runs again. A run still going when the next is due is not doubled.
function startMembershipExpiryJob(run = runMembershipExpiry, interval = HOUR_IN_MILLISECONDS) {
  let running = false;

  async function tick() {
    if (running) {
      return;
    }

    running = true;

    try {
      const { lapsed, reminded } = await run();

      if (lapsed > 0 || reminded > 0) {
        console.log(`Memberships: ${lapsed} moved to Gratuita, ${reminded} reminded`);
      }
    } catch (error) {
      console.error(`Membership expiry run failed: ${error.message}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, interval);
  timer.unref();
  tick();

  return () => clearInterval(timer);
}

module.exports = { runMembershipExpiry, startMembershipExpiryJob };
