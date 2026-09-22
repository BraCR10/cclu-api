const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listJobs,
  getJobById,
  listOwnJobs,
  createJob,
  updateJob,
  closeJob,
} = require('../../src/services/jobService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ANOTHER_MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const JOB_ID = '65f0c3a1b2c3d4e5f6a7b8cb';

const inOneMonth = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function paidOwner(overrides = {}) {
  return {
    _id: MEMBER_ID,
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    phone: '22791234',
    applicationStatus: 'approved',
    accountStatus: 'active',
    paidUntil: inOneMonth(),
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    _id: JOB_ID,
    member: MEMBER_ID,
    title: 'Panadero',
    description: 'Se busca panadero con experiencia.',
    requirements: 'Dos años de experiencia en horno de leña.',
    howToApply: 'Escriba al correo del comercio con su currículum.',
    contractType: 'full_time',
    location: 'La Unión',
    contactEmail: null,
    contactPhone: null,
    isActive: true,
    adminStatus: 'active',
    createdAt: new Date('2026-03-04T12:00:00.000Z'),
    ...overrides,
  };
}

const owners = (ids) => async () => ids;

function validBody(overrides = {}) {
  return {
    title: 'Panadero',
    description: 'Se busca panadero con experiencia.',
    requirements: 'Dos años de experiencia.',
    howToApply: 'Escriba al correo del comercio.',
    contractType: 'full_time',
    ...overrides,
  };
}

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a job is created with only the fields the caller may set', async () => {
  const saved = [];
  const save = async (fields) => {
    saved.push(fields);
    return job(fields);
  };

  const created = await createJob(MEMBER_ID, validBody({ title: '  Panadero  ' }), save);

  assert.equal(saved[0].member, MEMBER_ID);
  assert.equal(saved[0].title, 'Panadero');
  assert.equal(created.title, 'Panadero');
  assert.equal(created.requirements, 'Dos años de experiencia.');
  assert.equal(created.howToApply, 'Escriba al correo del comercio.');
});

test('a posting without requirements or instructions to apply is refused', async () => {
  for (const missing of ['requirements', 'howToApply']) {
    const error = await refusal(() => createJob(MEMBER_ID, validBody({ [missing]: undefined })));

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, missing);
  }
});

test('a title is required and cannot be only whitespace', async () => {
  const error = await refusal(() => createJob(MEMBER_ID, validBody({ title: '   ' })));

  assert.equal(error.statusCode, 400);
});

test('a contract type outside the accepted list is refused', async () => {
  const error = await refusal(() => createJob(MEMBER_ID, validBody({ contractType: 'freelance' })));

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, 'contractType');
});

test('an operator sent as a field never becomes part of the record', async () => {
  const error = await refusal(() => createJob(MEMBER_ID, validBody({ title: { $ne: null } })));

  assert.equal(error.statusCode, 400);
});

test('a contact email must look like one when it is offered at all', async () => {
  const error = await refusal(() =>
    createJob(MEMBER_ID, validBody({ contactEmail: 'not-an-email' })),
  );

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, 'contactEmail');
});

test('a body that is not an object is refused', async () => {
  for (const body of [null, undefined, 'text', ['a']]) {
    await refusal(() => createJob(MEMBER_ID, body));
  }
});

test('the public board asks only for what a paid, visible owner published', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [job({ member: paidOwner() })];
  };

  const answer = await listJobs({}, owners([MEMBER_ID]), find, async () => 1);

  assert.deepEqual(filters[0].member, { $in: [MEMBER_ID] });
  assert.equal(filters[0].isActive, true);
  assert.equal(filters[0].adminStatus, 'active');
  assert.equal(answer.items[0].title, 'Panadero');
});

test('a contract type filter is applied only when it names a real one', async () => {
  const filters = [];
  const find = async (filter) => {
    filters.push(filter);
    return [];
  };

  await listJobs({ contractType: 'internship' }, owners([]), find, async () => 0);
  await listJobs({ contractType: 'made up' }, owners([]), find, async () => 0);

  assert.equal(filters[0].contractType, 'internship');
  assert.equal('contractType' in filters[1], false);
});

test('a posting with no contact of its own answers with the commerce contact', async () => {
  const find = async () => [job({ member: paidOwner() })];

  const answer = await listJobs({}, owners([MEMBER_ID]), find, async () => 1);

  assert.equal(answer.items[0].contactEmail, 'socio@example.cr');
  assert.equal(answer.items[0].contactPhone, '22791234');
});

test('a posting with its own contact keeps it over the commerce one', async () => {
  const find = async () => [
    job({ contactEmail: 'rrhh@panaderia.cr', contactPhone: '88880000', member: paidOwner() }),
  ];

  const answer = await listJobs({}, owners([MEMBER_ID]), find, async () => 1);

  assert.equal(answer.items[0].contactEmail, 'rrhh@panaderia.cr');
  assert.equal(answer.items[0].contactPhone, '88880000');
});

test('a closed, moderated or unpaid posting answers the same as one that never existed', async () => {
  for (const fixture of [
    null,
    job({ isActive: false, member: paidOwner() }),
    job({ adminStatus: 'inactive', member: paidOwner() }),
    job({ adminStatus: 'blocked', member: paidOwner() }),
    job({ member: paidOwner({ paidUntil: new Date(Date.now() - 1000) }) }),
    job({ member: paidOwner({ applicationStatus: 'pending_review' }) }),
  ]) {
    const error = await refusal(() => getJobById(JOB_ID, async () => fixture));

    assert.equal(error.statusCode, 404);
  }
});

test('a visible posting is opened whole, requirements and application included', async () => {
  const found = await getJobById(JOB_ID, async () => job({ member: paidOwner() }));

  assert.equal(found.requirements, 'Dos años de experiencia en horno de leña.');
  assert.equal(found.howToApply, 'Escriba al correo del comercio con su currículum.');
});

test('an id that is not a real reference never reaches the database', async () => {
  const neverAsked = async () => {
    throw new Error('the database was queried for an id that could not be real');
  };

  for (const id of ['not-an-id', '', undefined, null, 42]) {
    const error = await refusal(() => getJobById(id, neverAsked));

    assert.equal(error.statusCode, 404);
  }
});

test('a member sees every posting of their own, open or closed', async () => {
  const jobs = [job(), job({ _id: 'other', isActive: false })];
  const answer = await listOwnJobs(MEMBER_ID, async () => jobs);

  assert.equal(answer.length, 2);
  assert.equal(answer[1].isActive, false);
});

test('a member may edit their own posting', async () => {
  const applied = [];
  const apply = async (id, update) => {
    applied.push({ id, update });
    return job({ title: 'Panadero senior' });
  };

  const updated = await updateJob(
    JOB_ID,
    MEMBER_ID,
    { title: 'Panadero senior' },
    async () => job(),
    apply,
  );

  assert.equal(updated.title, 'Panadero senior');
  assert.deepEqual(applied[0].update.$set, { title: 'Panadero senior' });
});

test('requirements and how to apply are editable but never emptied', async () => {
  const apply = async (id, update) => job(update.$set);

  const updated = await updateJob(
    JOB_ID,
    MEMBER_ID,
    { requirements: 'Nueva experiencia', howToApply: 'Nuevo canal' },
    async () => job(),
    apply,
  );

  assert.equal(updated.requirements, 'Nueva experiencia');

  const error = await refusal(() =>
    updateJob(JOB_ID, MEMBER_ID, { requirements: '   ' }, async () => job(), apply),
  );

  assert.equal(error.statusCode, 400);
});

test('a member cannot edit a posting that belongs to someone else', async () => {
  const error = await refusal(() =>
    updateJob(JOB_ID, ANOTHER_MEMBER_ID, { title: 'x' }, async () => job()),
  );

  assert.equal(error.statusCode, 403);
});

test('a blocked posting cannot be touched again, not even by its owner', async () => {
  const error = await refusal(() =>
    updateJob(JOB_ID, MEMBER_ID, { title: 'x' }, async () => job({ adminStatus: 'blocked' })),
  );

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'blocked_publication');
});

test('editing a posting that no longer exists is a not found', async () => {
  const error = await refusal(() => updateJob(JOB_ID, MEMBER_ID, { title: 'x' }, async () => null));

  assert.equal(error.statusCode, 404);
});

test('an update that changes nothing is refused', async () => {
  const error = await refusal(() => updateJob(JOB_ID, MEMBER_ID, {}, async () => job()));

  assert.match(error.message, /changes nothing/);
});

test('clearing an optional field removes it rather than storing it blank', async () => {
  const applied = [];
  const apply = async (id, update) => {
    applied.push(update);
    return job({ location: undefined });
  };

  await updateJob(JOB_ID, MEMBER_ID, { location: '' }, async () => job(), apply);

  assert.deepEqual(applied[0].$unset, { location: '' });
});

test('closing a posting turns it off instead of removing the record', async () => {
  const applied = [];
  const apply = async (id) => applied.push(id);

  await closeJob(JOB_ID, MEMBER_ID, async () => job(), apply);

  assert.deepEqual(applied, [JOB_ID]);
});

test('closing a posting that belongs to someone else is refused', async () => {
  const error = await refusal(() =>
    closeJob(
      JOB_ID,
      ANOTHER_MEMBER_ID,
      async () => job(),
      async () => {
        throw new Error('should never be reached');
      },
    ),
  );

  assert.equal(error.statusCode, 403);
});

test('nothing administrative about the owner survives into a public answer', async () => {
  const find = async () => [job({ member: paidOwner({ passwordHash: '$2b$12$notarealhash' }) })];

  const answer = await listJobs({}, owners([MEMBER_ID]), find, async () => 1);
  const raw = JSON.stringify(answer);

  for (const secret of ['$2b$12$notarealhash', 'paidUntil', 'applicationStatus']) {
    assert.ok(!raw.includes(secret), `the answer carried ${secret}`);
  }
});
