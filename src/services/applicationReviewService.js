const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Activity, ACTIVITY_STATUSES } = require('../models/Activity');
const { generateMemberCode } = require('./memberCodeService');
const { issueResubmissionToken, CORRECTABLE_FIELDS } = require('./resubmissionService');
const emailService = require('./emailService');
const { grantFreeMembership } = require('./membershipService');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { readSearch, escapeForRegex } = require('../config/listSearch');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAXIMUM_REASON_LENGTH = 500;
const MAXIMUM_FIELD_MESSAGE_LENGTH = 200;
const DUPLICATE_KEY = 11000;

// Five draws from thirty three million. Exhausting them means the index is
// broken, not that the space is full, so the loop is short on purpose.
const MAXIMUM_CODE_ATTEMPTS = 5;

// What an administrator needs to judge a registration. The password hash is
// deliberately absent: nothing about a decision requires reading it.
const APPLICATION_FIELDS = [
  'email',
  'phone',
  'whatsappNumber',
  'memberType',
  'identificationType',
  'identificationNumber',
  'name',
  'legalName',
  'legalRepresentativeName',
  'legalRepresentativeIdentification',
  'certificationFileKey',
  'certificationIssuedAt',
  'businessName',
  'managerName',
  'activity',
  'activityOther',
  'businessDescription',
  'logoFileKey',
  'logoUrl',
  'branchModality',
  'branchName',
  'canton',
  'district',
  'location',
  'institutionalPhone',
  'billingEmail',
  'consents',
  'consentedAt',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'applicationStatus',
  'createdAt',
].join(' ');

const DECISION_FIELDS =
  'applicationStatus statusReason changesRequestedFields memberCode reviewedAt email businessName activity activityOther';

// Everything a reviewer reads on the detail screen: the application itself plus
// the decision already taken, if there is one, so a decided application can be
// opened from the list and explained.
const APPLICATION_DETAIL_FIELDS = [
  APPLICATION_FIELDS,
  'statusReason',
  'changesRequestedFields',
  'memberCode',
  'reviewedAt',
].join(' ');

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
  'changesRequestedFields',
  'memberCode',
  'reviewedAt',
  'createdAt',
].join(' ');

// Asking for changes is an answer as well: the chamber has looked at the
// application and the next move is the applicant's, so leaving it out of this
// list would make it disappear from both views.
const REVIEWED_STATUSES = [
  APPLICATION_STATUSES.APPROVED,
  APPLICATION_STATUSES.REJECTED,
  APPLICATION_STATUSES.CHANGES_REQUESTED,
];

class ApplicationReviewError extends ApplicationError {
  constructor(code, message, { statusCode = 400, field = null, reason } = {}) {
    super(code, message, { statusCode, field, reason, name: 'ApplicationReviewError' });
  }
}

function readMemberId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ApplicationReviewError(
      ERROR_CODES.INVALID_FORMAT,
      'The application identifier is not valid.',
    );
  }

  return value;
}

// A rejection is permanent and a request for changes leaves the applicant with
// work to do, so neither may go out without a motive: an empty one would leave
// them with a closed door and no explanation, or with a list of things to fix
// that says nothing.
function readDecisionReason(body, action) {
  const reason = body === null || typeof body !== 'object' ? undefined : body.reason;

  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new ApplicationReviewError(
      ERROR_CODES.REQUIRED,
      `A reason is required to ${action} an application.`,
      { field: 'reason' },
    );
  }

  const trimmed = reason.trim();

  if (trimmed.length > MAXIMUM_REASON_LENGTH) {
    throw new ApplicationReviewError(ERROR_CODES.TOO_LONG, 'The reason is longer than allowed.', {
      field: 'reason',
    });
  }

  return trimmed;
}

// The chamber names what it wants corrected, and only from the list the
// correction form is able to show. Naming something else would send the
// applicant looking for a field that is not there, and naming it without a
// reason would leave them looking at it without knowing what to change.
function readCorrections(body) {
  const fields = body === null || typeof body !== 'object' ? undefined : body.fields;

  if (fields === undefined || fields === null) {
    return [];
  }

  if (!Array.isArray(fields)) {
    throw new ApplicationReviewError(
      ERROR_CODES.INVALID_FORMAT,
      'The fields to correct have to be sent as a list.',
      { field: 'fields' },
    );
  }

  const named = [];

  for (const entry of fields) {
    const field = entry === null || typeof entry !== 'object' ? undefined : entry.field;

    if (typeof field !== 'string' || !CORRECTABLE_FIELDS.includes(field)) {
      throw new ApplicationReviewError(
        ERROR_CODES.NOT_ALLOWED,
        'That field cannot be corrected from the link.',
        { field: 'fields', reason: typeof field === 'string' ? field : typeof entry },
      );
    }

    const message = typeof entry.message === 'string' ? entry.message.trim() : '';

    if (message === '') {
      throw new ApplicationReviewError(
        ERROR_CODES.REQUIRED,
        'Every field to correct needs a reason of its own.',
        { field: 'fields', reason: field },
      );
    }

    if (message.length > MAXIMUM_FIELD_MESSAGE_LENGTH) {
      throw new ApplicationReviewError(
        ERROR_CODES.TOO_LONG,
        'That reason for a field is longer than allowed.',
        { field: 'fields', reason: field },
      );
    }

    // The same field asked for twice is one field with the first reason it was
    // given, rather than two identical lines in the message.
    if (!named.some((already) => already.field === field)) {
      named.push({ field, message });
    }
  }

  return named;
}

// The oldest application is decided first. Whoever has waited longest is seen
// first, rather than whoever happens to sort last.
const PENDING = { applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW };

async function listPendingApplications(query) {
  const pagination = readPagination(query);
  const filter = { ...PENDING, ...applicationSearch(query) };

  const [items, total] = await Promise.all([
    Member.find(filter)
      .select(APPLICATION_FIELDS)
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .sort({ createdAt: 1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    Member.countDocuments(filter),
  ]);

  return paginated(items, total, pagination);
}

// Most recent first: the decision someone is asking about is almost always the
// one just made.
const DECIDED = { applicationStatus: { $in: REVIEWED_STATUSES } };

// A reviewer looking for one application types a business or a person, so the
// search answers to the names an applicant gave, the address they registered
// with, the document, and the code an approved one now has.
function applicationSearch(query) {
  const search = readSearch(query);

  if (search === null) {
    return {};
  }

  const pattern = new RegExp(escapeForRegex(search), 'i');

  return {
    $or: [
      { businessName: pattern },
      { name: pattern },
      { email: pattern },
      { identificationNumber: pattern },
      { memberCode: pattern },
    ],
  };
}

async function listDecidedApplications(query) {
  const pagination = readPagination(query);
  const filter = { ...DECIDED, ...applicationSearch(query) };

  const [items, total] = await Promise.all([
    Member.find(filter)
      .select(DECIDED_FIELDS)
      .populate('reviewedBy', 'email')
      .populate('activity', 'name')
      .sort({ reviewedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    Member.countDocuments(filter),
  ]);

  return paginated(items, total, pagination);
}

function defaultFindApplication(memberId) {
  return Member.findById(memberId)
    .select(APPLICATION_DETAIL_FIELDS)
    .populate('canton', 'name province')
    .populate('activity', 'name')
    .populate('reviewedBy', 'email')
    .lean();
}

// One application, as the list already showed it, but whole: the detail screen
// opens decided ones too, which is where the reason and the reviewer live.
async function readApplication(memberId, find = defaultFindApplication) {
  const id = readMemberId(memberId);
  const application = await find(id);

  if (application === null || application === undefined) {
    throw new ApplicationReviewError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      'That application does not exist.',
      { statusCode: 404 },
    );
  }

  return application;
}

function updateMatchingApplication(filter, changes) {
  return Member.findOneAndUpdate(filter, changes, {
    returnDocument: 'after',
    runValidators: true,
  })
    .select(DECISION_FIELDS)
    .lean();
}

// An approved member is on Gratuita from the start. The approval is already
// written when the grant runs, so a grant that fails must not fail the
// approval: the applicant would never be mailed their code, and a retry would
// find the application already decided. A missing membership reads as
// Gratuita, and reading it grants it, so the grant is completed the first
// time the member looks.
async function approveMatchingApplication(
  filter,
  changes,
  grant = grantFreeMembership,
  update = updateMatchingApplication,
) {
  const approved = await update(filter, changes);

  if (approved !== null && approved !== undefined) {
    try {
      await grant(approved._id, approved.reviewedAt);
    } catch (error) {
      console.error('Gratuita not granted on approval', {
        member: String(approved._id),
        reason: error.message,
      });
    }
  }

  return approved;
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
    throw new ApplicationReviewError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      'No application exists with that identifier.',
      { statusCode: 404 },
    );
  }

  // Only administrators reach this point, so naming the state costs nothing and
  // lets the panel say what happened instead of guessing.
  throw new ApplicationReviewError(
    ERROR_CODES.ALREADY_DECIDED,
    'This application was already decided.',
    { statusCode: 409, reason: existing.applicationStatus },
  );
}

// A duplicate name is not a failure: two applicants can name the same activity
// and the catalog only needs one of them. The unique index is what decides, so
// the answer is to let it decide.
//
// What approval does not do is accept the trade: the application is in order, but
// the chamber has not said that this is how the activity should be named in the
// catalog. The entry waits as pending, offered to nobody, until an administrator
// accepts it from the catalog screen.
async function addNamedActivity(name, create = (document) => Activity.create(document)) {
  try {
    await create({ name, status: ACTIVITY_STATUSES.PENDING });
  } catch (error) {
    if (error.code !== DUPLICATE_KEY) {
      throw error;
    }
  }
}

// Step 2 promises that an activity nobody carried before joins the catalog when
// the chamber accepts the registration that named it. One chosen from the
// catalog is already in it and is left alone.
async function recordNamedActivity(application, add = addNamedActivity) {
  if (application?.activity !== undefined && application?.activity !== null) {
    return;
  }

  const named = application?.activityOther;

  if (typeof named !== 'string' || named.trim() === '') {
    return;
  }

  await add(named.trim());
}

async function approveApplication(
  memberId,
  reviewerId,
  decide = approveMatchingApplication,
  findStatus = findApplicationStatus,
  newCode = generateMemberCode,
  record = recordNamedActivity,
  notify = emailService.notify,
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
        $unset: { statusReason: '', changesRequestedFields: '' },
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

    await record(approved);

    // The decision is written before the message is attempted, for the same
    // reason a rejection is: a mail server that is down must not undo it. The
    // code travels in the message, which is the only place the applicant reads
    // it before they can sign in and find it again.
    const notified = await notify('applicationApproved', approved.email, {
      businessName: approved.businessName,
      memberCode: approved.memberCode,
    });

    return { ...approved, notified };
  }

  throw new ApplicationReviewError(
    ERROR_CODES.INTERNAL_ERROR,
    'A member code could not be assigned.',
    { statusCode: 500 },
  );
}

// Built here rather than in the template, because only the API knows the token
// and where the site answers.
function resubmitUrlFor(token, origin = process.env.WEB_ORIGIN) {
  return origin === undefined ? undefined : `${origin.replace(/\/+$/, '')}/resubmit/${token}`;
}

async function rejectApplication(
  memberId,
  reviewerId,
  body,
  decide = updateMatchingApplication,
  findStatus = findApplicationStatus,
  issueToken = issueResubmissionToken,
  notify = emailService.notify,
) {
  const id = readMemberId(memberId);
  const reason = readDecisionReason(body, 'reject');

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

  // The decision is already written. A message that does not leave is reported,
  // never undone, so the administrator learns the applicant was not reached.
  const { token } = await issueToken(id);
  const notified = await notify('applicationRejected', rejected.email, {
    businessName: rejected.businessName,
    reason,
    resubmitUrl: resubmitUrlFor(token),
  });

  // The address and the name were read to send the message, not to answer with.
  const decision = { ...rejected };
  delete decision.email;
  delete decision.businessName;

  return { ...decision, notified };
}

// The middle answer: the application is not refused, but it is not accepted
// either, and the applicant is told exactly what to fix before sending it back.
// The same link a rejection carries is issued here, so there is one way back in
// rather than two.
async function requestChangesApplication(
  memberId,
  reviewerId,
  body,
  decide = updateMatchingApplication,
  findStatus = findApplicationStatus,
  issueToken = issueResubmissionToken,
  notify = emailService.notify,
) {
  const id = readMemberId(memberId);
  const reason = readDecisionReason(body, 'request changes to');
  const fields = readCorrections(body);

  const reviewed = await decide(pendingApplication(id), {
    $set: {
      applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
      statusReason: reason,
      changesRequestedFields: fields,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
  });

  if (reviewed === null || reviewed === undefined) {
    await refuseDecision(id, findStatus);
  }

  // The decision is already written. A message that does not leave is reported,
  // never undone, so the administrator learns the applicant was not reached.
  const { token } = await issueToken(id);
  const notified = await notify('applicationChangesRequested', reviewed.email, {
    businessName: reviewed.businessName,
    reason,
    fields,
    resubmitUrl: resubmitUrlFor(token),
  });

  // The address and the name were read to send the message, not to answer with.
  const decision = { ...reviewed };
  delete decision.email;
  delete decision.businessName;

  return { ...decision, notified };
}

module.exports = {
  listPendingApplications,
  listDecidedApplications,
  readApplication,
  applicationSearch,
  approveApplication,
  approveMatchingApplication,
  rejectApplication,
  requestChangesApplication,
  ApplicationReviewError,
  MAXIMUM_CODE_ATTEMPTS,
};
