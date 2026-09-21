const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listListings,
  getListingById,
  listOwnListings,
  createListing,
  updateListing,
  closeListing,
  uploadListingImage,
  removeListingImage,
} = require('../../src/services/marketplaceService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ANOTHER_MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const LISTING_ID = '65f0c3a1b2c3d4e5f6a7b8cb';
const IMAGE_KEY = 'marketplace-listings/65f0c3a1b2c3d4e5f6a7b8c9/x.png';
const SIGNED_URL = 'https://storage.example/signed-for-a-short-while';

const inOneMonth = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

// A populated owner in good standing with the paid membership, as Mongo would
// hand it back beside the listing.
function paidOwner(overrides = {}) {
  return {
    _id: MEMBER_ID,
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    phone: '22791234',
    location: 'Frente al parque',
    applicationStatus: 'approved',
    accountStatus: 'active',
    paidUntil: inOneMonth(),
    canton: { name: 'La Unión' },
    sector: { name: 'Comercio' },
    ...overrides,
  };
}

function listing(overrides = {}) {
  return {
    _id: LISTING_ID,
    member: MEMBER_ID,
    title: 'Pan artesanal',
    description: 'Pan de masa madre horneado a diario.',
    price: 2500,
    category: 'Alimentos',
    imageKey: undefined,
    isActive: true,
    adminStatus: 'active',
    createdAt: new Date('2026-03-04T12:00:00.000Z'),
    ...overrides,
  };
}

const owners = (ids) => async () => ids;

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a listing is created with only the fields the caller may set', async () => {
  const saved = [];
  const save = async (fields) => {
    saved.push(fields);
    return listing(fields);
  };

  const created = await createListing(
    MEMBER_ID,
    { title: '  Pan artesanal  ', description: 'Pan de masa madre.', price: '2500' },
    save,
  );

  assert.equal(saved[0].member, MEMBER_ID);
  assert.equal(saved[0].title, 'Pan artesanal');
  assert.equal(saved[0].price, 2500);
  assert.equal(created.title, 'Pan artesanal');
  assert.equal(created.imageUrl, null);
});

test('a title is required and cannot be only whitespace', async () => {
  const error = await refusal(() => createListing(MEMBER_ID, { title: '   ', description: 'x' }));

  assert.equal(error.statusCode, 400);
});

test('a negative or nonsensical price is refused', async () => {
  for (const price of [-5, 'free', Number.NaN, Infinity]) {
    const error = await refusal(() =>
      createListing(MEMBER_ID, { title: 'x', description: 'x', price }),
    );

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'price');
  }
});

test('a listing with no price at all is still created', async () => {
  const created = await createListing(MEMBER_ID, { title: 'x', description: 'x' }, async (fields) =>
    listing(fields),
  );

  assert.equal(created.price, null);
});

test('a body that is not an object is refused', async () => {
  for (const body of [null, undefined, 'text', ['a']]) {
    await refusal(() => createListing(MEMBER_ID, body));
  }
});

test('the public listing asks only for what a paid, visible owner published', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [listing({ member: paidOwner() })];
  };

  const answer = await listListings({}, owners([MEMBER_ID]), find, async () => 1);

  assert.deepEqual(filters[0].member, { $in: [MEMBER_ID] });
  assert.equal(filters[0].isActive, true);
  assert.equal(filters[0].adminStatus, 'active');
  assert.equal(answer.items.length, 1);
});

test('a name filter is read as a case insensitive match over the title', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [];
  };

  await listListings({ name: 'pan' }, owners([]), find, async () => 0);

  assert.match('Pan artesanal', filters[0].title);
});

test('canton and sector travel to the owner query, not the listing one', async () => {
  const asked = [];
  const findOwners = async (territory) => {
    asked.push(territory);
    return [];
  };

  await listListings(
    { canton: MEMBER_ID, sector: ANOTHER_MEMBER_ID },
    findOwners,
    async () => [],
    async () => 0,
  );

  assert.deepEqual(asked[0], { canton: MEMBER_ID, sector: ANOTHER_MEMBER_ID });
});

test('a category filter is applied only when it is real text', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [];
  };

  await listListings({ category: 'Alimentos' }, owners([]), find, async () => 0);
  await listListings({ category: '   ' }, owners([]), find, async () => 0);

  assert.equal(filters[0].category, 'Alimentos');
  assert.equal('category' in filters[1], false);
});

test('a listing carries the whole public card of the commerce behind it', async () => {
  const find = async () => [listing({ member: paidOwner() })];

  const answer = await listListings({}, owners([MEMBER_ID]), find, async () => 1);

  assert.deepEqual(answer.items[0].business, {
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    phone: '22791234',
    location: 'Frente al parque',
    whatsappNumber: null,
    instagram: null,
    facebook: null,
    linkedin: null,
    website: null,
    canton: 'La Unión',
    sector: 'Comercio',
  });
});

test('a listing carrying an image key answers with a signed address', async () => {
  const find = async () => [listing({ imageKey: IMAGE_KEY, member: paidOwner() })];
  const sign = async (key) => (key === IMAGE_KEY ? SIGNED_URL : null);

  const answer = await listListings({}, owners([MEMBER_ID]), find, async () => 1, sign);

  assert.equal(answer.items[0].imageUrl, SIGNED_URL);
});

test('a closed, moderated or unpaid listing answers the same as one that never existed', async () => {
  for (const fixture of [
    null,
    listing({ isActive: false, member: paidOwner() }),
    listing({ adminStatus: 'inactive', member: paidOwner() }),
    listing({ adminStatus: 'blocked', member: paidOwner() }),
    listing({ member: paidOwner({ paidUntil: new Date(Date.now() - 1000) }) }),
    listing({ member: paidOwner({ accountStatus: 'suspended' }) }),
  ]) {
    const error = await refusal(() => getListingById(LISTING_ID, async () => fixture));

    assert.equal(error.statusCode, 404);
  }
});

test('a visible listing is opened with its business card', async () => {
  const found = await getListingById(LISTING_ID, async () => listing({ member: paidOwner() }));

  assert.equal(found.title, 'Pan artesanal');
  assert.equal(found.business.businessName, 'Panadería Tres Ríos');
});

test('an id that is not a real reference never reaches the database', async () => {
  const neverAsked = async () => {
    throw new Error('the database was queried for an id that could not be real');
  };

  for (const id of ['not-an-id', '', undefined, null, 42]) {
    const error = await refusal(() => getListingById(id, neverAsked));

    assert.equal(error.statusCode, 404);
  }
});

test('a member sees every listing of their own, open or closed', async () => {
  const listings = [listing(), listing({ _id: 'other', isActive: false })];
  const answer = await listOwnListings(MEMBER_ID, async () => listings);

  assert.equal(answer.length, 2);
  assert.equal(answer[1].isActive, false);
});

test('a member may edit their own listing', async () => {
  const applied = [];
  const apply = async (id, update) => {
    applied.push({ id, update });
    return listing({ title: 'Pan artesanal grande' });
  };

  const updated = await updateListing(
    LISTING_ID,
    MEMBER_ID,
    { title: 'Pan artesanal grande' },
    async () => listing(),
    apply,
  );

  assert.equal(updated.title, 'Pan artesanal grande');
  assert.deepEqual(applied[0].update.$set, { title: 'Pan artesanal grande' });
});

test('a member cannot edit a listing that belongs to someone else', async () => {
  const error = await refusal(() =>
    updateListing(LISTING_ID, ANOTHER_MEMBER_ID, { title: 'x' }, async () => listing()),
  );

  assert.equal(error.statusCode, 403);
});

test('a blocked listing cannot be touched again, not even by its owner', async () => {
  const error = await refusal(() =>
    updateListing(LISTING_ID, MEMBER_ID, { title: 'x' }, async () =>
      listing({ adminStatus: 'blocked' }),
    ),
  );

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'blocked_publication');
});

test('clearing the price removes it rather than storing it blank', async () => {
  const applied = [];
  const apply = async (id, update) => {
    applied.push(update);
    return listing({ price: undefined });
  };

  await updateListing(LISTING_ID, MEMBER_ID, { price: '' }, async () => listing(), apply);

  assert.deepEqual(applied[0].$unset, { price: '' });
});

test('an update that changes nothing is refused', async () => {
  const error = await refusal(() =>
    updateListing(LISTING_ID, MEMBER_ID, {}, async () => listing()),
  );

  assert.match(error.message, /changes nothing/);
});

test('closing a listing turns it off instead of removing the record', async () => {
  const applied = [];
  const apply = async (id) => applied.push(id);

  await closeListing(LISTING_ID, MEMBER_ID, async () => listing(), apply);

  assert.deepEqual(applied, [LISTING_ID]);
});

test('closing a listing that belongs to someone else is refused', async () => {
  const error = await refusal(() =>
    closeListing(
      LISTING_ID,
      ANOTHER_MEMBER_ID,
      async () => listing(),
      async () => {
        throw new Error('should never be reached');
      },
    ),
  );

  assert.equal(error.statusCode, 403);
});

test('uploading a first image stores the key and signs an address for it', async () => {
  const saved = [];
  const answer = await uploadListingImage(
    LISTING_ID,
    MEMBER_ID,
    { contentType: 'image/png', content: 'ignored-by-the-fake' },
    async () => listing({ member: MEMBER_ID, imageKey: undefined }),
    async () => ({ key: IMAGE_KEY }),
    async (id, key) => saved.push({ id, key }),
    async () => {
      throw new Error('nothing should be removed when there was no previous image');
    },
    async (key) => (key === IMAGE_KEY ? SIGNED_URL : null),
  );

  assert.deepEqual(answer, { imageUrl: SIGNED_URL });
  assert.deepEqual(saved, [{ id: LISTING_ID, key: IMAGE_KEY }]);
});

test('replacing an image removes the old object only after the new one is saved', async () => {
  const order = [];

  await uploadListingImage(
    LISTING_ID,
    MEMBER_ID,
    { contentType: 'image/png', content: 'x' },
    async () => listing({ member: MEMBER_ID, imageKey: 'old-key' }),
    async () => ({ key: IMAGE_KEY }),
    async () => order.push('saved'),
    async () => order.push('removed'),
    async () => SIGNED_URL,
  );

  assert.deepEqual(order, ['saved', 'removed']);
});

test('uploading an image for a listing owned by someone else is refused', async () => {
  const error = await refusal(() =>
    uploadListingImage(
      LISTING_ID,
      ANOTHER_MEMBER_ID,
      { contentType: 'image/png', content: 'x' },
      async () => listing({ member: MEMBER_ID }),
    ),
  );

  assert.equal(error.statusCode, 403);
});

test('removing an image clears the reference and the stored object', async () => {
  const removed = [];
  const cleared = [];

  await removeListingImage(
    LISTING_ID,
    MEMBER_ID,
    async () => listing({ member: MEMBER_ID, imageKey: IMAGE_KEY }),
    async (key) => removed.push(key),
    async (id) => cleared.push(id),
  );

  assert.deepEqual(removed, [IMAGE_KEY]);
  assert.deepEqual(cleared, [LISTING_ID]);
});

test('nothing administrative about the owner survives into a public answer', async () => {
  const find = async () => [
    listing({
      member: paidOwner({
        passwordHash: '$2b$12$notarealhash',
        identificationNumber: '3101456789',
      }),
    }),
  ];

  const answer = await listListings({}, owners([MEMBER_ID]), find, async () => 1);
  const raw = JSON.stringify(answer);

  for (const secret of ['$2b$12$notarealhash', '3101456789', 'approved', 'paidUntil']) {
    assert.ok(!raw.includes(secret), `the answer carried ${secret}`);
  }
});
