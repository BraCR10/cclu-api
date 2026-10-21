require('dotenv').config();

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const {
  Member,
  APPLICATION_STATUSES,
  BRANCH_MODALITIES,
  MEMBER_TYPES,
  IDENTIFICATION_TYPES,
  SHOP_DAYS,
} = require('../src/models/Member');
const { Branch } = require('../src/models/Branch');
const { Membership } = require('../src/models/Membership');
const { Notification } = require('../src/models/Notification');
const { Plan } = require('../src/models/Plan');
const { Canton } = require('../src/models/Canton');
const { Activity } = require('../src/models/Activity');
const { ACCOUNT_STATUSES } = require('../src/config/accountStatus');
const { expiryFrom } = require('../src/config/chamberCalendar');
const { generateMemberCode, normalizeMemberCode } = require('../src/services/memberCodeService');
const { hashPassword } = require('../src/services/passwordService');
const { DEMO_DOMAIN, DEMO_EMAIL, demoEmail } = require('./demoAccounts');
const demoMembers = require('./data/demo-members.json');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const WEEKDAY_HOURS = { closed: false, opensAt: '07:00', closesAt: '18:00' };
const SATURDAY_HOURS = { closed: false, opensAt: '08:00', closesAt: '14:00' };

function shopWeek() {
  return SHOP_DAYS.map((day) => {
    if (day === 'sunday') {
      return { day, closed: true };
    }

    return { day, ...(day === 'saturday' ? SATURDAY_HOURS : WEEKDAY_HOURS) };
  });
}

// A demo account can be signed into only when DEMO_MEMBER_PASSWORD is set, so a
// shared environment never holds accounts with a password written in a file.
async function demoPasswordHash() {
  const password = process.env.DEMO_MEMBER_PASSWORD || crypto.randomBytes(24).toString('base64');

  return hashPassword(password);
}

async function upsertMember(entry, index, references) {
  const email = demoEmail(entry.slug);
  const existing = await Member.findOne({ email }).select('memberCode').lean();
  const approved = entry.applicationStatus === undefined;
  const firstBranch = entry.branches[0];

  const fields = {
    email,
    businessName: entry.businessName,
    businessDescription: entry.description,
    memberType: MEMBER_TYPES.BUSINESS,
    identificationType: IDENTIFICATION_TYPES.LEGAL_ENTITY_ID,
    identificationNumber: `3101${String(900000 + index).padStart(6, '0')}`,
    phone: entry.phone,
    whatsappNumber: entry.phone,
    instagram: entry.instagram,
    activity: references.activities[index % references.activities.length]._id,
    storeCategories: references.activities.slice(0, 2).map((activity) => activity._id),
    storeSchedule: shopWeek(),
    branchModality: entry.virtual ? BRANCH_MODALITIES.VIRTUAL : BRANCH_MODALITIES.PHYSICAL,
    branchName: firstBranch?.name ?? 'En línea',
    canton: references.canton._id,
    district: firstBranch?.district ?? 'Tres Ríos',
    location: firstBranch?.address,
    passwordHash: await demoPasswordHash(),
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
    applicationStatus: approved ? APPLICATION_STATUSES.APPROVED : entry.applicationStatus,
  };

  if (approved) {
    fields.memberCode = existing?.memberCode ?? normalizeMemberCode(generateMemberCode());
  }

  return Member.findOneAndUpdate(
    { email },
    { $set: fields },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
    },
  ).lean();
}

async function replaceBranches(member, entry, canton) {
  await Branch.deleteMany({ member: member._id });

  await Branch.insertMany(
    entry.branches.map((branch, position) => ({
      member: member._id,
      name: branch.name,
      isPrimary: position === 0,
      canton: canton._id,
      district: branch.district,
      address: branch.address,
      phone: entry.phone,
    })),
  );
}

async function upsertMembership(member, entry, plans, now) {
  const plan = plans.get(entry.plan);
  const paid = entry.plan !== 'free';
  const expiresAt = !paid
    ? null
    : entry.expiresInDays === undefined
      ? expiryFrom(now, 'monthly')
      : new Date(now.getTime() + entry.expiresInDays * DAY_IN_MILLISECONDS);

  await Membership.findOneAndUpdate(
    { member: member._id },
    {
      $set: {
        plan: plan._id,
        startedAt: now,
        expiresAt,
        frequency: paid ? 'monthly' : null,
        lastPaymentAt: paid ? now : null,
        lapsed: null,
        reminderSentFor: null,
      },
    },
    { upsert: true },
  );
}

async function loadReferences() {
  const [canton, activities, plans] = await Promise.all([
    Canton.findOne({ name: 'La Unión' }).lean(),
    Activity.find().sort({ name: 1 }).limit(6).lean(),
    Plan.find().lean(),
  ]);

  if (canton === null || activities.length === 0 || plans.length === 0) {
    throw new Error(
      'Run npm run seed-catalogs first: the demo data needs cantons, activities and plans.',
    );
  }

  return { canton, activities, plans: new Map(plans.map((plan) => [plan.key, plan])) };
}

async function seedDemo() {
  const references = await loadReferences();
  const now = new Date();

  for (const [index, entry] of demoMembers.entries()) {
    const member = await upsertMember(entry, index, references);

    await replaceBranches(member, entry, references.canton);

    if (entry.plan !== undefined) {
      await upsertMembership(member, entry, references.plans, now);
    }
  }

  console.log(`Demo data: ${demoMembers.length} businesses under @${DEMO_DOMAIN}`);
}

async function removeDemo() {
  const ids = await Member.distinct('_id', { email: DEMO_EMAIL });

  const [branches, memberships, notifications, members] = await Promise.all([
    Branch.deleteMany({ member: { $in: ids } }),
    Membership.deleteMany({ member: { $in: ids } }),
    Notification.deleteMany({ recipient: { $in: ids } }),
    Member.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log(
    `Demo data removed: ${members.deletedCount} businesses, ${branches.deletedCount} branches, ` +
      `${memberships.deletedCount} memberships, ${notifications.deletedCount} notifications`,
  );
}

const removing = process.argv.includes('--remove');

connectDatabase()
  .then(() => (removing ? removeDemo() : seedDemo()))
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
