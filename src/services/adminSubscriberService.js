const mongoose = require('mongoose');
const { Subscriber, SUBSCRIBER_STATUSES } = require('../models/Subscriber');
// Registered here because a subscriber populates its canton.
require('../models/Canton');
const { refuse } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');
const { toCsv } = require('../config/csv');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAXIMUM_DISTRICT_LENGTH = 80;
const SPANISH = { locale: 'es', strength: 1 };
const STATUSES = Object.values(SUBSCRIBER_STATUSES);

function readFilters(query) {
  const { canton, district, status } = query ?? {};

  if (canton && (typeof canton !== 'string' || !OBJECT_ID.test(canton))) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'canton', 'canton is a catalog identifier.');
  }

  if (
    district &&
    (typeof district !== 'string' || district.trim().length > MAXIMUM_DISTRICT_LENGTH || !canton)
  ) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'A district is filtered within a canton.');
  }

  if (status && (typeof status !== 'string' || !STATUSES.includes(status))) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'status', `status is one of ${STATUSES.join(', ')}.`);
  }

  const search = readSearch(query);
  const pattern = search === null ? null : { $regex: escapeForRegex(search), $options: 'i' };

  return {
    ...(canton ? { canton: new mongoose.Types.ObjectId(canton) } : {}),
    ...(district ? { district: district.trim() } : {}),
    ...(status ? { status } : {}),
    ...(pattern === null
      ? {}
      : { $or: [{ name: pattern }, { email: pattern }, { whatsappNumber: pattern }] }),
  };
}

function presentSubscriber(subscriber) {
  return {
    id: String(subscriber._id),
    name: subscriber.name,
    email: subscriber.email,
    whatsappNumber: subscriber.whatsappNumber ?? null,
    canton: subscriber.canton?.name ?? null,
    province: subscriber.canton?.province ?? null,
    district: subscriber.district,
    status: subscriber.status,
    // The latest consent, so somebody who came back shows when they did.
    subscribedAt: subscriber.consentedAt,
  };
}

function findSubscribers(filter) {
  return Subscriber.find(filter)
    .collation(SPANISH)
    .sort({ consentedAt: -1, _id: -1 })
    .populate('canton', 'name province');
}

const defaultStore = {
  list: (filter, { skip, pageSize }) => findSubscribers(filter).skip(skip).limit(pageSize).lean(),
  count: (filter) => Subscriber.countDocuments(filter).collation(SPANISH),
  all: (filter) => findSubscribers(filter).lean(),
  districts: (canton) =>
    Subscriber.distinct('district', { canton: new mongoose.Types.ObjectId(canton) }),
};

async function listSubscribers(query, store = defaultStore) {
  const filter = readFilters(query);
  const pagination = readPagination(query);
  const [items, total] = await Promise.all([store.list(filter, pagination), store.count(filter)]);

  return paginated(items.map(presentSubscriber), total, pagination);
}

const STATUS_LABELS = {
  [SUBSCRIBER_STATUSES.SUBSCRIBED]: 'Suscrito',
  [SUBSCRIBER_STATUSES.UNSUBSCRIBED]: 'Dado de baja',
};

// Every subscriber the filters match, not only the page on screen, for the
// chamber's mailing tools. The file is Spanish because a person opens it.
async function exportSubscribers(query, store = defaultStore) {
  const subscribers = (await store.all(readFilters(query))).map(presentSubscriber);

  return toCsv(
    [
      'Nombre',
      'Correo electrónico',
      'WhatsApp',
      'Provincia',
      'Cantón',
      'Distrito',
      'Fecha de suscripción',
      'Estado',
    ],
    subscribers.map((subscriber) => [
      subscriber.name,
      subscriber.email,
      subscriber.whatsappNumber,
      subscriber.province,
      subscriber.canton,
      subscriber.district,
      subscriber.subscribedAt.toISOString().slice(0, 10),
      STATUS_LABELS[subscriber.status],
    ]),
  );
}

async function listSubscriberDistricts(query, store = defaultStore) {
  const canton = query?.canton;

  if (typeof canton !== 'string' || !OBJECT_ID.test(canton)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'canton', 'The districts are listed for a canton.');
  }

  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const unique = [];

  for (const name of (await store.districts(canton)).map((value) => value.trim())) {
    if (name !== '' && !unique.some((kept) => collator.compare(kept, name) === 0)) {
      unique.push(name);
    }
  }

  return { districts: unique.sort(collator.compare) };
}

module.exports = { listSubscribers, exportSubscribers, listSubscriberDistricts };
