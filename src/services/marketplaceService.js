const { Listing } = require('../models/Listing');
const { FILE_PURPOSES } = require('../config/fileStorage');
const { ADMIN_STATUSES } = require('../config/adminStatus');
const { ValidationError, CODES, refuse, PATTERNS } = require('../config/memberRules');
const { readRequiredText, readOptionalText, requireBody } = require('../config/postingFields');
const { uploadImage } = require('./imageUploadService');
const { createDownloadUrl, deleteFile } = require('./fileStorageService');
const {
  BUSINESS_POPULATE,
  presentBusiness,
  isOwnerVisible,
  findVisibleOwnerIds,
  readPage,
  readLimit,
  textFilter,
} = require('./publicationAccessService');

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const CATEGORY_MAX = 60;
const MAXIMUM_PRICE = 1_000_000_000;

const LISTING_FIELDS =
  'member title description price category imageKey isActive adminStatus createdAt';

// Absent, null or empty all mean the same thing an optional text field means:
// nothing was offered. A price of zero is a real price and stays one.
function readPrice(body) {
  if (body.price === undefined || body.price === null || body.price === '') {
    return undefined;
  }

  const price = Number(body.price);

  if (!Number.isFinite(price) || price < 0 || price > MAXIMUM_PRICE) {
    refuse(CODES.INVALID_FORMAT, 'price', 'The field price is not a valid amount.');
  }

  return price;
}

function notFound() {
  return new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That listing no longer exists.', 404);
}

function notOwner() {
  return new ValidationError(
    CODES.NOT_ALLOWED,
    null,
    'This listing belongs to another member.',
    403,
  );
}

// The one shape a listing takes wherever it is read: on the public
// marketplace, on its own page, or in a member's own list.
async function presentListing(listing, sign = createDownloadUrl) {
  return {
    id: String(listing._id),
    title: listing.title,
    description: listing.description,
    price: listing.price ?? null,
    category: listing.category ?? null,
    imageUrl: listing.imageKey ? await sign(listing.imageKey) : null,
    isActive: listing.isActive,
    adminStatus: listing.adminStatus ?? ADMIN_STATUSES.ACTIVE,
    createdAt: listing.createdAt,
    business: presentBusiness(listing.member),
  };
}

function findPublicListings(filter, skip, limit) {
  return Listing.find(filter)
    .select(LISTING_FIELDS)
    .populate(BUSINESS_POPULATE)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

function countListings(filter) {
  return Listing.countDocuments(filter);
}

async function listListings(
  query,
  findOwners = findVisibleOwnerIds,
  find = findPublicListings,
  count = countListings,
  sign = createDownloadUrl,
) {
  const page = readPage(query?.page);
  const limit = readLimit(query?.limit);

  // Only what a visitor may actually open is counted, so the pages stay full:
  // owners without the paid membership are settled before skip and limit.
  const owners = await findOwners({ canton: query?.canton, sector: query?.sector });
  const filter = {
    member: { $in: owners },
    isActive: true,
    adminStatus: ADMIN_STATUSES.ACTIVE,
  };

  if (typeof query?.category === 'string' && query.category.trim() !== '') {
    filter.category = query.category.trim();
  }

  const name = textFilter(query?.name);

  if (name !== undefined) {
    filter.title = name;
  }

  const skip = (page - 1) * limit;
  const [listings, total] = await Promise.all([find(filter, skip, limit), count(filter)]);
  const items = await Promise.all(listings.map((listing) => presentListing(listing, sign)));

  return { items, total, page, limit, hasMore: skip + items.length < total };
}

function findPublicListingById(id) {
  return Listing.findById(id).select(LISTING_FIELDS).populate(BUSINESS_POPULATE).lean();
}

async function getListingById(id, find = findPublicListingById, sign = createDownloadUrl) {
  if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
    throw notFound();
  }

  const listing = await find(id);

  const visible =
    listing !== null &&
    listing !== undefined &&
    listing.isActive === true &&
    (listing.adminStatus ?? ADMIN_STATUSES.ACTIVE) === ADMIN_STATUSES.ACTIVE &&
    isOwnerVisible(listing.member);

  if (!visible) {
    throw notFound();
  }

  return presentListing(listing, sign);
}

function findOwnListings(memberId) {
  return Listing.find({ member: memberId }).select(LISTING_FIELDS).sort({ createdAt: -1 }).lean();
}

async function listOwnListings(memberId, find = findOwnListings, sign = createDownloadUrl) {
  const listings = await find(memberId);

  return Promise.all(listings.map((listing) => presentListing(listing, sign)));
}

async function createListing(
  memberId,
  rawBody,
  save = (listing) => Listing.create(listing).then((created) => created.toObject()),
) {
  const body = requireBody(rawBody);

  const created = await save({
    member: memberId,
    title: readRequiredText(body, 'title', TITLE_MAX),
    description: readRequiredText(body, 'description', DESCRIPTION_MAX),
    price: readPrice(body),
    category: readOptionalText(body, 'category', CATEGORY_MAX),
  });

  return presentListing(created);
}

function findListingForOwner(id) {
  return Listing.findById(id).select(LISTING_FIELDS).lean();
}

async function requireOwnedListing(id, memberId, find) {
  if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
    throw notFound();
  }

  const listing = await find(id);

  if (listing === null || listing === undefined) {
    throw notFound();
  }

  if (String(listing.member) !== String(memberId)) {
    throw notOwner();
  }

  // Blocked is the chamber's decision, and it is permanent: not even the
  // owner may touch the record again (CA-ADM-008-04).
  if (listing.adminStatus === ADMIN_STATUSES.BLOCKED) {
    throw new ValidationError(
      CODES.BLOCKED_PUBLICATION,
      null,
      'This listing was blocked by the chamber and cannot be changed.',
      403,
    );
  }

  return listing;
}

function buildListingChanges(rawBody) {
  const body = requireBody(rawBody);
  const changes = {};
  const unset = {};

  if ('title' in body) {
    changes.title = readRequiredText(body, 'title', TITLE_MAX);
  }

  if ('description' in body) {
    changes.description = readRequiredText(body, 'description', DESCRIPTION_MAX);
  }

  if ('price' in body) {
    const price = readPrice(body);

    if (price === undefined) {
      unset.price = '';
    } else {
      changes.price = price;
    }
  }

  if ('category' in body) {
    const category = readOptionalText(body, 'category', CATEGORY_MAX);

    if (category === undefined) {
      unset.category = '';
    } else {
      changes.category = category;
    }
  }

  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') {
      refuse(CODES.NOT_TEXT, 'isActive', 'The field isActive must be true or false.');
    }

    changes.isActive = body.isActive;
  }

  if (Object.keys(changes).length === 0 && Object.keys(unset).length === 0) {
    refuse(CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  return { changes, unset };
}

async function updateListing(
  id,
  memberId,
  rawBody,
  find = findListingForOwner,
  apply = (listingId, update) =>
    Listing.findByIdAndUpdate(listingId, update, { returnDocument: 'after', runValidators: true })
      .select(LISTING_FIELDS)
      .lean(),
) {
  await requireOwnedListing(id, memberId, find);

  const { changes, unset } = buildListingChanges(rawBody);
  const update = { $set: changes };

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  return presentListing(await apply(id, update));
}

// "Deleting" a listing closes it rather than removing the record: published
// content is kept permanently under BD-003, the same rule a job posting
// already answers to.
async function closeListing(
  id,
  memberId,
  find = findListingForOwner,
  apply = (listingId) => Listing.findByIdAndUpdate(listingId, { $set: { isActive: false } }),
) {
  await requireOwnedListing(id, memberId, find);
  await apply(id);
}

function findListingImageOwner(id) {
  return Listing.findById(id).select('member imageKey adminStatus').lean();
}

async function uploadListingImage(
  id,
  memberId,
  body,
  find = findListingImageOwner,
  upload = uploadImage,
  save = (listingId, imageKey) =>
    Listing.findByIdAndUpdate(listingId, { $set: { imageKey } }).select('imageKey').lean(),
  remove = deleteFile,
  sign = createDownloadUrl,
) {
  const existing = await requireOwnedListing(id, memberId, find);

  const { key } = await upload({
    purpose: FILE_PURPOSES.MARKETPLACE_LISTING,
    ownerId: memberId,
    contentType: body?.contentType,
    base64: body?.content,
  });

  await save(id, key);

  // Removed only once the new image is safely in place, so a failed upload
  // never leaves a listing with no image at all.
  if (existing.imageKey) {
    await remove(existing.imageKey);
  }

  return { imageUrl: await sign(key) };
}

async function removeListingImage(
  id,
  memberId,
  find = findListingImageOwner,
  remove = deleteFile,
  clear = (listingId) => Listing.findByIdAndUpdate(listingId, { $unset: { imageKey: '' } }),
) {
  const existing = await requireOwnedListing(id, memberId, find);

  if (existing.imageKey) {
    await remove(existing.imageKey);
    await clear(id);
  }
}

module.exports = {
  listListings,
  getListingById,
  listOwnListings,
  createListing,
  updateListing,
  closeListing,
  uploadListingImage,
  removeListingImage,
};
