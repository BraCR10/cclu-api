const { Subscriber, SUBSCRIBER_STATUSES } = require('../models/Subscriber');
const { Canton } = require('../models/Canton');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readText, readReference, readConsent } = require('../config/memberRules');

const DUPLICATE_KEY = 11000;

function alreadySubscribed() {
  return new ApplicationError(
    ERROR_CODES.ALREADY_SUBSCRIBED,
    'That address is already subscribed.',
    {
      statusCode: 409,
      field: 'email',
    },
  );
}

async function readSubscription(body, references) {
  const source = body === null || typeof body !== 'object' ? {} : body;

  return {
    name: readText(source, 'name', { required: true }),
    email: readText(source, 'email', { required: true }).toLowerCase(),
    whatsappNumber: readText(source, 'whatsappNumber', { required: false }),
    canton: await references.readCanton(source),
    district: readText(source, 'district', { required: true }),
    consent: readConsent(source, 'acceptsPromotions'),
  };
}

const defaultStore = {
  readCanton: (body) => readReference(body, 'canton', Canton),
  findByEmail: (email) => Subscriber.findOne({ email }).select('status').lean(),
  create: (fields) => Subscriber.create(fields),
  resubscribe: (email, fields) =>
    Subscriber.updateOne(
      { email, status: SUBSCRIBER_STATUSES.UNSUBSCRIBED },
      { $set: { ...fields, status: SUBSCRIBER_STATUSES.SUBSCRIBED, unsubscribedAt: null } },
    ),
};

// Anybody may ask for the promotions. An address that left is welcomed back
// with what it sends now; one already subscribed is told so rather than
// subscribed twice.
async function subscribe(body, now, store = defaultStore) {
  const { consent, ...fields } = await readSubscription(body, store);
  const stored = { ...fields, consentedAt: now };
  const existing = await store.findByEmail(fields.email);

  if (existing?.status === SUBSCRIBER_STATUSES.SUBSCRIBED) {
    throw alreadySubscribed();
  }

  if (existing?.status === SUBSCRIBER_STATUSES.UNSUBSCRIBED) {
    await store.resubscribe(fields.email, stored);
    return { subscribed: consent };
  }

  try {
    await store.create(stored);
  } catch (error) {
    // Two requests for the same address at once: the index lets one in.
    if (error.code === DUPLICATE_KEY) {
      throw alreadySubscribed();
    }

    throw error;
  }

  return { subscribed: consent };
}

module.exports = { subscribe };
