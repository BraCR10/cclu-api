const { Member } = require('../models/Member');
const { Setting, SETTING_KEYS } = require('../models/Setting');
const { MEMBERSHIP_BENEFITS } = require('../config/membershipBenefits');
const { ValidationError, refuse, CODES } = require('../config/memberRules');

const MEMBERSHIP_TYPES = {
  FREE: 'free',
  PAID: 'paid',
};

// The single rule that says whether a membership is the paid one. Everything
// that gates on payment reads this, so the rule cannot drift between modules.
function hasPaidMembership(member, now = () => new Date()) {
  return member?.paidUntil instanceof Date && member.paidUntil.getTime() > now().getTime();
}

function findFeeSetting() {
  return Setting.findOne({ key: SETTING_KEYS.MONTHLY_FEE }).select('amount').lean();
}

async function readMonthlyFee(find = findFeeSetting) {
  const setting = await find();

  return { amount: setting?.amount ?? null };
}

function readAmount(body) {
  const amount = body === null || typeof body !== 'object' ? undefined : Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    refuse(CODES.INVALID_FORMAT, 'amount', 'The field amount is not a valid fee.');
  }

  return amount;
}

function saveFeeSetting(amount) {
  return Setting.findOneAndUpdate(
    { key: SETTING_KEYS.MONTHLY_FEE },
    { $set: { amount } },
    { upsert: true, returnDocument: 'after' },
  )
    .select('amount')
    .lean();
}

// The new amount applies from this moment on: payments already registered keep
// the amount they were registered with.
async function updateMonthlyFee(body, save = saveFeeSetting) {
  const amount = readAmount(body);
  const saved = await save(amount);

  return { amount: saved.amount };
}

function findMemberPaidUntil(memberId) {
  return Member.findById(memberId).select('paidUntil').lean();
}

async function readOwnMembership(memberId, find = findMemberPaidUntil, findFee = findFeeSetting) {
  const member = await find(memberId);

  if (member === null || member === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  const paid = hasPaidMembership(member);
  const fee = await findFee();

  return {
    type: paid ? MEMBERSHIP_TYPES.PAID : MEMBERSHIP_TYPES.FREE,
    paidUntil: paid ? member.paidUntil : null,
    feeAmount: fee?.amount ?? null,
    benefits: MEMBERSHIP_BENEFITS,
  };
}

module.exports = {
  MEMBERSHIP_TYPES,
  hasPaidMembership,
  readMonthlyFee,
  updateMonthlyFee,
  readOwnMembership,
  findFeeSetting,
};
