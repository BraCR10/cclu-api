const { Branch } = require('../models/Branch');
const { Member } = require('../models/Member');
const { Activity } = require('../models/Activity');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readText, readReference, refuse } = require('../config/memberRules');

const REQUIRED_TEXT_FIELDS = ['name', 'district', 'address'];
const OPTIONAL_TEXT_FIELDS = ['phone', 'schedule', 'municipalPermit'];
const WRITABLE_FIELDS = [...REQUIRED_TEXT_FIELDS, ...OPTIONAL_TEXT_FIELDS];

function notFound(message = 'That branch no longer exists.') {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, message, { statusCode: 404 });
}

// Only what the member's own screen shows. The member id and the removal date
// stay in the document.
function present(branch) {
  const canton = branch.canton !== null && typeof branch.canton === 'object' ? branch.canton : null;
  const activity =
    branch.activity !== null && branch.activity !== undefined && typeof branch.activity === 'object'
      ? branch.activity
      : null;

  return {
    id: String(branch._id),
    name: branch.name,
    isPrimary: branch.isPrimary === true,
    canton:
      canton === null
        ? null
        : { _id: String(canton._id), name: canton.name, province: canton.province },
    district: branch.district,
    address: branch.address,
    phone: branch.phone ?? null,
    schedule: branch.schedule ?? null,
    municipalPermit: branch.municipalPermit ?? null,
    activity: activity === null ? null : { _id: String(activity._id), name: activity.name },
  };
}

// The three fields a branch cannot exist without are required of a new one and
// only rewritten when sent. An optional field sent empty is a removal, which is
// how a member takes a phone number or a schedule back off the branch.
async function readFields(body, { partial }) {
  const changes = {};
  const unset = {};

  for (const field of WRITABLE_FIELDS) {
    const required = !partial && REQUIRED_TEXT_FIELDS.includes(field);

    if (partial && !(field in body)) {
      continue;
    }

    const value = readText(body, field, { required });

    if (value === undefined) {
      if (partial) {
        unset[field] = '';
      }

      continue;
    }

    changes[field] = value;
  }

  if (!partial || 'activity' in body) {
    const activity = await readReference(body, 'activity', Activity, { required: false });

    if (activity === undefined) {
      if (partial) {
        unset.activity = '';
      }
    } else {
      changes.activity = activity;
    }
  }

  return { changes, unset };
}

// The branch the approval recorded: the applicant's own answers become the first
// one, so a member never opens the screen on an empty list of the place they
// already registered.
function firstBranchFor(member) {
  if (member.branchName === undefined || member.branchName === null) {
    return null;
  }

  if (member.location === undefined || member.location === null) {
    return null;
  }

  return {
    member: member._id,
    name: member.branchName,
    isPrimary: true,
    canton: member.canton,
    district: member.district,
    address: member.location,
    phone: member.institutionalPhone,
    activity: member.activity,
  };
}

const ACTIVE = { removedAt: null };

const defaultStore = {
  findMember: (memberId) =>
    Member.findById(memberId)
      .select('branchName canton district location institutionalPhone activity')
      .lean(),
  countActive: (memberId) => Branch.countDocuments({ member: memberId, ...ACTIVE }),
  list: (memberId) =>
    Branch.find({ member: memberId, ...ACTIVE })
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .sort({ createdAt: 1 })
      .lean(),
  find: (memberId, branchId) =>
    Branch.findOne({ _id: branchId, member: memberId, ...ACTIVE })
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .lean(),
  create: async (fields) => {
    const created = await Branch.create(fields);

    return created.toObject();
  },
  update: (branchId, update) =>
    Branch.findByIdAndUpdate(branchId, update, { returnDocument: 'after' })
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .lean(),
  // A branch is part of what the chamber keeps: closing one is a date, not a
  // delete, so a decision about it stays readable afterwards.
  remove: (branchId) => Branch.updateOne({ _id: branchId }, { $set: { removedAt: new Date() } }),
  clearPrimary: (memberId) =>
    Branch.updateMany(
      { member: memberId, isPrimary: true, ...ACTIVE },
      { $set: { isPrimary: false } },
    ),
  promoteFirst: async (memberId) => {
    const next = await Branch.findOne({ member: memberId, ...ACTIVE })
      .sort({ createdAt: 1 })
      .lean();

    if (next !== null && next !== undefined) {
      await Branch.updateOne({ _id: next._id }, { $set: { isPrimary: true } });
    }
  },
};

async function readOwnBranches(memberId, store = defaultStore) {
  const member = await store.findMember(memberId);

  if (member === null || member === undefined) {
    throw notFound('That account no longer exists.');
  }

  let branches = await store.list(memberId);

  if (branches.length === 0) {
    const seed = firstBranchFor(member);

    if (seed !== null) {
      await store.create(seed);
      branches = await store.list(memberId);
    }
  }

  return { items: branches.map(present) };
}

async function createBranch(memberId, body, store = defaultStore) {
  const member = await store.findMember(memberId);

  if (member === null || member === undefined) {
    throw notFound('That account no longer exists.');
  }

  const { changes } = await readFields(body, { partial: false });
  const existing = await store.countActive(memberId);
  // The first branch is the primary one whatever the body says: a member cannot
  // hold branches without one of them being theirs by default.
  const isPrimary = body.isPrimary === true || existing === 0;

  if (isPrimary) {
    await store.clearPrimary(memberId);
  }

  const created = await store.create({ ...changes, member: memberId, isPrimary });
  // Read back rather than answer with what was written: the canton and the
  // activity travel as their names, and the new document only holds their ids.
  const saved = (await store.find(memberId, created._id)) ?? created;

  return present(saved);
}

async function updateBranch(memberId, branchId, body, store = defaultStore) {
  const branch = await store.find(memberId, branchId);

  if (branch === null || branch === undefined) {
    throw notFound();
  }

  const { changes, unset } = await readFields(body, { partial: true });

  if (
    Object.keys(changes).length === 0 &&
    Object.keys(unset).length === 0 &&
    body.isPrimary !== true
  ) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  const update = {};

  if (Object.keys(changes).length > 0) {
    update.$set = changes;
  }

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  if (body.isPrimary === true && branch.isPrimary !== true) {
    // Clearing first keeps the rule true at every moment: there is never a
    // moment with two primary branches, only one with none.
    await store.clearPrimary(memberId);
    update.$set = { ...(update.$set ?? {}), isPrimary: true };
  }

  const updated = Object.keys(update).length > 0 ? await store.update(branchId, update) : branch;

  return present(updated);
}

async function deleteBranch(memberId, branchId, store = defaultStore) {
  const branch = await store.find(memberId, branchId);

  if (branch === null || branch === undefined) {
    throw notFound();
  }

  const active = await store.countActive(memberId);

  // The chamber affiliates a place, so a member always keeps one. Closing the
  // last one is refused rather than left to the screen to prevent.
  if (active <= 1) {
    refuse(ERROR_CODES.LAST_BRANCH, null, 'A member keeps at least one branch.', 409);
  }

  await store.remove(branchId);

  if (branch.isPrimary === true) {
    await store.promoteFirst(memberId);
  }

  return readOwnBranches(memberId, store);
}

module.exports = { readOwnBranches, createBranch, updateBranch, deleteBranch, present };
