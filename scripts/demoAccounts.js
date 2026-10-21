// Every demo account lives under a domain that can never receive mail, which is
// also how removing the demo data finds them all and touches nothing else.
const DEMO_DOMAIN = 'demo.camaralaunion.invalid';

// Anchored at both ends, so an address that only contains the domain, or uses
// it as a prefix of another, is never taken for a demo account.
const DEMO_EMAIL = new RegExp(`^[^@\\s]+@${DEMO_DOMAIN.replace(/\./g, '\\.')}$`);

function demoEmail(slug) {
  return `${slug}@${DEMO_DOMAIN}`;
}

module.exports = { DEMO_DOMAIN, DEMO_EMAIL, demoEmail };
