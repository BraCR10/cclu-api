const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { generateMemberCode } = require('./memberCodeService');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAXIMUM_REASON_LENGTH = 500;
const DUPLICATE_KEY = 11000;

// Five draws from thirty three million. Exhausting them means the index is
// broken, not that the space is full, so the loop is short on purpose.
const MAXIMUM_CODE_ATTEMPTS = 5;

// What an administrator needs to judge a registration. The password hash is
// deliberately absent: nothing about a decision requires reading it.
const APPLICATION_FIELDS = [
  'email',
  'phone',
  'location',
  'memberType',
  'identificationType',
  'identificationNumber',
  'businessName',
  'businessDescription',
  'logoUrl',
  'whatsappNumber',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'applicationStatus',
  'createdAt',
].join(' ');

const DECISION_FIELDS = 'applicationStatus statusReason memberCode reviewedAt';

// What a decision left behind. The reason and the reviewer are carried because
// an administrator asked a week later has nowhere else to look.
const DECIDED_FIELDS = [
  'businessName',
  'email',
  'memberType',
  'identificationType',
  'identificationNumber',
  'applicationStatus',
  'statusReason',
  'memberCode',
  'reviewedAt',
  'createdAt',
].join(' ');

const DECIDED_STATUSES = [APPLICATION_STATUSES.APPROVED, APPLICATION_STATUSES.REJECTED];

class ApplicationReviewError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ApplicationReviewError';
    this.statusCode = statusCode;
  }
}

function readMemberId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ApplicationReviewError('The application identifier is not valid.');
  }

  return value;
}

// A rejection is permanent and the applicant is told why, so an empty motive
// would leave them with a closed door and no explanation.
function readReason(body) {
  const reason = body === null || typeof body !== 'object' ? undefined : body.reason;

  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new ApplicationReviewError('A reason is required to reject an application.');
  }

  const trimmed = reason.trim();

  if (trimmed.length > MAXIMUM_REASON_LENGTH) {
    throw new ApplicationReviewError('The reason is longer than allowed.');
  }

  return trimmed;
}

// The oldest application is decided first. Whoever has waited longest is seen
// first, rather than whoever happens to sort last.
function listPendingApplications() {
  return Member.find({ applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW })
    .select(APPLICATION_FIELDS)
    .populate('canton', 'name province')
    .populate('sector', 'name')
    .sort({ createdAt: 1 })
    .lean();
}

// Most recent first: the decision someone is asking about is almost always the
// one just made.
function listDecidedApplications() {
  return Member.find({ applicationStatus: { $in: DECIDED_STATUSES } })
    .select(DECIDED_FIELDS)
    .populate('reviewedBy', 'email')
    .populate('sector', 'name')
    .sort({ reviewedAt: -1 })
    .lean();
}

function updateMatchingApplication(filter, changes) {
  return Member.findOneAndUpdate(filter, changes, {
    returnDocument: 'after',
    runValidators: true,
  })
    .select(DECISION_FIELDS)
    .lean();
}

// The expected state travels inside the filter, so the read and the write are a
// single operation. Two administrators deciding at once cannot both succeed.
function pendingApplication(memberId) {
  return { _id: memberId, applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW };
}

function findApplicationStatus(memberId) {
  return Member.findById(memberId).select('applicationStatus').lean();
}

// Reached only when the conditional update matched nothing, which says the
// application is missing or was already decided but not which.
async function refuseDecision(memberId, findStatus) {
  const existing = await findStatus(memberId);

  if (existing === null || existing === undefined) {
    throw new ApplicationReviewError('No application exists with that identifier.', 404);
  }

  const error = new ApplicationReviewError('This application was already decided.', 409);

  // Only administrators reach this point, so naming the state costs nothing and
  // lets the panel say what happened instead of guessing.
  error.reason = existing.applicationStatus;

  throw error;
}

async function approveApplication(
  memberId,
  reviewerId,
  decide = updateMatchingApplication,
  findStatus = findApplicationStatus,
  newCode = generateMemberCode,
) {
  const id = readMemberId(memberId);

  for (let attempt = 0; attempt < MAXIMUM_CODE_ATTEMPTS; attempt += 1) {
    let approved;

    try {
      approved = await decide(pendingApplication(id), {
        $set: {
          applicationStatus: APPLICATION_STATUSES.APPROVED,
          memberCode: newCode(),
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
        $unset: { statusReason: '' },
      });
    } catch (error) {
      // The unique index is what proves a code is free. A collision is answered
      // by drawing another, never by asking the database first.
      if (error.code === DUPLICATE_KEY) {
        continue;
      }

      throw error;
    }

    if (approved === null || approved === undefined) {
      await refuseDecision(id, findStatus);
    }

    return approved;
  }

  throw new ApplicationReviewError('A member code could not be assigned.', 500);
}

async function rejectApplication(
  memberId,
  reviewerId,
  body,
  decide = updateMatchingApplication,
  findStatus = findApplicationStatus,
) {
  const id = readMemberId(memberId);
  const reason = readReason(body);

  // No member code is drawn here. A code is the mark of belonging to the
  // chamber, and a rejected applicant never belonged.
  const rejected = await decide(pendingApplication(id), {
    $set: {
      applicationStatus: APPLICATION_STATUSES.REJECTED,
      statusReason: reason,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
  });

  if (rejected === null || rejected === undefined) {
    await refuseDecision(id, findStatus);
  }

  return rejected;
}

module.exports = {
  listPendingApplications,
  listDecidedApplications,
  approveApplication,
  rejectApplication,
  ApplicationReviewError,
  MAXIMUM_CODE_ATTEMPTS,
};
