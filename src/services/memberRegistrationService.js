const {
  Member,
  MEMBER_TYPES,
  BRANCH_MODALITIES,
  IDENTIFICATION_TYPES,
} = require('../models/Member');
const { ROLES } = require('../config/roles');
const accountService = require('./accountService');
const emailService = require('./emailService');
const { Canton } = require('../models/Canton');
const { Activity } = require('../models/Activity');
const passwordService = require('./passwordService');
const {
  readText,
  readChoice,
  readPassword,
  readReference,
  readCalendarDate,
  readFileKey,
  readConsent,
  ValidationError,
  refuse,
} = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');

// The form draws three steps and this reads them in that order. Every field is
// named one by one, and nothing outside these lists is ever read: spreading the
// body would let a caller set their own role or arrive already approved.
const STEP_ONE_CHOICES = [
  { field: 'memberType', allowed: Object.values(MEMBER_TYPES) },
  { field: 'identificationType', allowed: Object.values(IDENTIFICATION_TYPES) },
];

// An empresa and an asociación are both proved by a cédula jurídica; a person by
// their own document.
const IDENTIFICATION_TYPES_BY_MEMBER_TYPE = {
  [MEMBER_TYPES.BUSINESS]: [IDENTIFICATION_TYPES.LEGAL_ENTITY_ID],
  [MEMBER_TYPES.ASSOCIATION]: [IDENTIFICATION_TYPES.LEGAL_ENTITY_ID],
  [MEMBER_TYPES.INDEPENDENT_PROFESSIONAL]: [
    IDENTIFICATION_TYPES.NATIONAL_ID,
    IDENTIFICATION_TYPES.DIMEX,
    IDENTIFICATION_TYPES.PASSPORT,
  ],
};

// What names the applicant. A company or an association gives its razón social
// and the person who answers for it; a profesional independiente is named by
// their own name alone.
const IDENTITY_FIELDS_BY_MEMBER_TYPE = {
  [MEMBER_TYPES.BUSINESS]: [
    'legalName',
    'legalRepresentativeName',
    'legalRepresentativeIdentification',
  ],
  [MEMBER_TYPES.ASSOCIATION]: [
    'legalName',
    'legalRepresentativeName',
    'legalRepresentativeIdentification',
  ],
  [MEMBER_TYPES.INDEPENDENT_PROFESSIONAL]: ['name'],
};

// Only these two carry a personería jurídica to upload and to date.
const MEMBER_TYPES_WITH_A_COMPANY_DOCUMENT = [MEMBER_TYPES.BUSINESS, MEMBER_TYPES.ASSOCIATION];

// Step 2. The business, and the single branch a registration carries.
const STEP_TWO_REQUIRED_TEXT_FIELDS = [
  'businessName',
  'managerName',
  'businessDescription',
  'branchName',
  'district',
  'institutionalPhone',
];

// Step 3. How the chamber and the clients reach the business.
const STEP_THREE_REQUIRED_TEXT_FIELDS = ['email', 'phone', 'whatsappNumber', 'billingEmail'];

const OPTIONAL_TEXT_FIELDS = ['activityOther', 'instagram', 'facebook', 'linkedin'];

// Rendered as links later, so the scheme is checked there rather than trusted
// to whatever displays them.
const OPTIONAL_LINK_FIELDS = ['website', 'logoUrl'];

// The three boxes the form asks for. Agreeing to all of them is a condition of
// affiliating, so a missing one stops the registration.
const CONSENT_FIELDS = ['statutes', 'marketplaceTerms', 'privacyPolicy'];

// The activity is the one reference the form may answer by writing it out
// instead, so it is optional here and checked against the written one below.
const REQUIRED_REFERENCE_FIELDS = [
  { field: 'canton', model: Canton },
  { field: 'activity', model: Activity, required: false },
];

async function buildRegistration(body, references = REQUIRED_REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The registration body is missing.');
  }

  const registration = {};

  // Step 1. The choices come first: what the applicant is decides which of the
  // fields below they are asked for.
  for (const { field, allowed } of STEP_ONE_CHOICES) {
    registration[field] = readChoice(body, field, allowed);
  }

  const identificationTypes = IDENTIFICATION_TYPES_BY_MEMBER_TYPE[registration.memberType];

  if (!identificationTypes.includes(registration.identificationType)) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      'identificationType',
      'That identification type does not go with that member type.',
    );
  }

  registration.identificationNumber = readText(body, 'identificationNumber', { required: true });

  for (const field of IDENTITY_FIELDS_BY_MEMBER_TYPE[registration.memberType]) {
    registration[field] = readText(body, field, { required: true });
  }

  // Step 2. The business as the public sees it.
  for (const field of STEP_TWO_REQUIRED_TEXT_FIELDS) {
    registration[field] = readText(body, field, { required: true });
  }

  registration.branchModality = readChoice(
    body,
    'branchModality',
    Object.values(BRANCH_MODALITIES),
  );

  // A branch without a door has no street to give, which is why the form calls
  // the address optional for one that sells online.
  registration.location = readText(body, 'location', {
    required: registration.branchModality === BRANCH_MODALITIES.PHYSICAL,
  });

  // Step 3. The account, and every way of reaching the business.
  for (const field of STEP_THREE_REQUIRED_TEXT_FIELDS) {
    registration[field] = readText(body, field, { required: true });
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = readText(body, field, { required: false });

    if (value !== undefined) {
      registration[field] = value;
    }
  }

  for (const field of OPTIONAL_LINK_FIELDS) {
    const value = readText(body, field, { required: false });

    if (value !== undefined) {
      registration[field] = value;
    }
  }

  const logoFileKey = readFileKey(body, 'logoFileKey', { required: false });

  if (logoFileKey !== undefined) {
    registration.logoFileKey = logoFileKey;
  }

  // Only a company or an association has a personería jurídica, and only it is
  // asked to produce and date one.
  if (MEMBER_TYPES_WITH_A_COMPANY_DOCUMENT.includes(registration.memberType)) {
    registration.certificationFileKey = readFileKey(body, 'certificationFileKey', {
      required: true,
    });
    registration.certificationIssuedAt = readCalendarDate(body, 'certificationIssuedAt', {
      required: true,
    });
  }

  // Read before the references, so a body that was never going to be accepted
  // costs no lookups.
  const password = readPassword(body);

  // Consent is a condition of affiliating, so it is read before those lookups
  // for the same reason.
  for (const field of CONSENT_FIELDS) {
    readConsent(body.consents, field);
  }

  const found = await Promise.all(
    references.map(({ field, model, required }) =>
      readReference(body, field, model, { required: required ?? true }),
    ),
  );

  references.forEach(({ field }, index) => {
    if (found[index] !== undefined) {
      registration[field] = found[index];
    }
  });

  // The chamber classifies every member, so the activity is either one from the
  // catalog or one written out, and never neither.
  if (registration.activity === undefined && registration.activityOther === undefined) {
    refuse(ERROR_CODES.REQUIRED, 'activity', 'An activity is required.');
  }

  registration.consents = Object.fromEntries(CONSENT_FIELDS.map((field) => [field, true]));
  registration.consentedAt = new Date();
  // The password was chosen here, so this is the day the profile shows beside
  // the link that sets a new one.
  registration.passwordChangedAt = registration.consentedAt;
  registration.passwordHash = await passwordService.hashPassword(password);

  // Set here and nowhere else. The schema's defaults decide the account and the
  // application, so a body carrying either is simply never read.
  return registration;
}

// The unique index is the guarantee. Checking first and inserting after leaves
// a gap two simultaneous registrations can both pass through.
const DUPLICATE_KEY = 11000;

// One answer for an address another member holds and for one an administrator
// holds. Told apart, this form becomes a way of asking the chamber who its
// administrators are, and it is open to anyone.
function alreadyRegistered() {
  return new ValidationError(
    ERROR_CODES.ALREADY_REGISTERED,
    null,
    'The registration could not be completed. Contact the chamber for help.',
    409,
  );
}

// The chamber's answer on arrival: the registration is in, and here is what
// happens next. Sent through notify, so a mail server that is down cannot turn a
// registration that was stored into a failure the applicant sees.
const DAYS_TO_REVIEW = 5;

function notifyReceivedNotice(registration) {
  return emailService.notify('applicationReceived', registration.email, {
    name: registration.name ?? registration.managerName ?? registration.legalRepresentativeName,
    businessName: registration.businessName,
    email: registration.email,
    daysToReview: DAYS_TO_REVIEW,
  });
}

async function registerMember(
  body,
  create = (document) => Member.create(document),
  references = REQUIRED_REFERENCE_FIELDS,
  heldByAnotherRole = accountService.emailHeldByAnotherRole,
  sendReceivedNotice = notifyReceivedNotice,
) {
  const registration = await buildRegistration(body, references);

  // The index below cannot see the administrators, so an address one of them
  // holds is refused here instead, in the same words.
  if (await heldByAnotherRole(registration.email, ROLES.MEMBER)) {
    throw alreadyRegistered();
  }

  try {
    const member = await create(registration);

    await sendReceivedNotice(registration);

    return { id: String(member._id) };
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      throw alreadyRegistered();
    }

    throw error;
  }
}

module.exports = {
  registerMember,
  buildRegistration,
  IDENTIFICATION_TYPES_BY_MEMBER_TYPE,
  IDENTITY_FIELDS_BY_MEMBER_TYPE,
};
