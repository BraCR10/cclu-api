const { ApplicationError, ERROR_CODES } = require('./errorCodes');

// Every constraint a member's data answers to, in one place. The web mirrors
// the shape and length rules so a person is told before they send anything;
// these are the ones that decide.
const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[0-9+\-() ]{8,20}$/,
  identificationNumber: /^[0-9A-Za-z-]{6,20}$/,
  handle: /^[^\s<>]{1,60}$/,
  link: /^https?:\/\/[^\s<>]{4,300}$/i,
  objectId: /^[0-9a-fA-F]{24}$/,
  // A stored file is named by the service that wrote it, so this only has to
  // refuse anything a driver would have to interpret rather than store.
  storageKey: /^[A-Za-z0-9][A-Za-z0-9._/-]{0,299}$/,
};

const FIELDS = {
  // A person's name has no shape worth enforcing. Every rule anybody writes for
  // one refuses somebody's real name.
  name: { maxLength: 120 },
  email: { maxLength: 254, pattern: 'email' },
  phone: { maxLength: 20, pattern: 'phone' },
  whatsappNumber: { maxLength: 20, pattern: 'phone' },
  identificationNumber: { maxLength: 20, pattern: 'identificationNumber' },
  location: { maxLength: 200 },
  businessName: { maxLength: 120 },
  legalName: { maxLength: 120 },
  managerName: { maxLength: 120 },
  branchName: { maxLength: 120 },
  district: { maxLength: 80 },
  address: { maxLength: 200 },
  schedule: { maxLength: 120 },
  municipalPermit: { maxLength: 60 },
  legalRepresentativeName: { maxLength: 120 },
  legalRepresentativeIdentification: { maxLength: 20, pattern: 'identificationNumber' },
  activityOther: { maxLength: 120 },
  institutionalPhone: { maxLength: 20, pattern: 'phone' },
  billingEmail: { maxLength: 254, pattern: 'email' },
  fileKey: { maxLength: 300, pattern: 'storageKey' },
  businessDescription: { maxLength: 500 },
  instagram: { maxLength: 60, pattern: 'handle' },
  facebook: { maxLength: 60, pattern: 'handle' },
  linkedin: { maxLength: 60, pattern: 'handle' },
  website: { maxLength: 300, pattern: 'link' },
  logoUrl: { maxLength: 300, pattern: 'link' },
  statusReason: { maxLength: 500 },
};

// bcrypt reads no further than the 72nd byte, so a longer password would carry
// a tail that counts for nothing. The three requirements are matched with
// Unicode properties, so ñ and an accented vowel count as letters.
const PASSWORD = {
  minimumLength: 10,
  maximumBytes: 72,
  requirements: [
    { code: 'password_needs_letter', pattern: /\p{L}/u, description: 'a letter' },
    { code: 'password_needs_digit', pattern: /\p{Nd}/u, description: 'a number' },
    { code: 'password_needs_special', pattern: /[^\p{L}\p{Nd}]/u, description: 'a symbol' },
  ],
};

class ValidationError extends ApplicationError {
  constructor(code, field, message, statusCode = 400) {
    super(code, message, { statusCode, field, name: 'ValidationError' });
  }
}

function refuse(code, field, message, statusCode = 400) {
  throw new ValidationError(code, field, message, statusCode);
}

function readText(body, field, { required }) {
  const rule = FIELDS[field] ?? {};
  const value = body[field];

  if (value === undefined || value === null || value === '') {
    if (required) {
      refuse(ERROR_CODES.REQUIRED, field, `The field ${field} is required.`);
    }

    return undefined;
  }

  // A value that is not a string stops being data and becomes part of the
  // query, because MongoDB reads $ and . as operators.
  if (typeof value !== 'string') {
    refuse(ERROR_CODES.NOT_TEXT, field, `The field ${field} must be text.`);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    if (required) {
      refuse(ERROR_CODES.REQUIRED, field, `The field ${field} is required.`);
    }

    return undefined;
  }

  if (rule.maxLength !== undefined && trimmed.length > rule.maxLength) {
    refuse(ERROR_CODES.TOO_LONG, field, `The field ${field} is longer than ${rule.maxLength}.`);
  }

  if (rule.pattern !== undefined && !PATTERNS[rule.pattern].test(trimmed)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The field ${field} is not in the expected format.`);
  }

  return trimmed;
}

function readChoice(body, field, allowed) {
  const value = readText(body, field, { required: true });

  if (!allowed.includes(value)) {
    refuse(ERROR_CODES.NOT_ALLOWED, field, `The field ${field} is not one of the accepted values.`);
  }

  return value;
}

function readPassword(body, field = 'password') {
  const password = body[field];

  if (typeof password !== 'string' || password.length < PASSWORD.minimumLength) {
    refuse(
      ERROR_CODES.PASSWORD_TOO_SHORT,
      field,
      `The password must be at least ${PASSWORD.minimumLength} characters.`,
    );
  }

  if (Buffer.byteLength(password, 'utf8') > PASSWORD.maximumBytes) {
    refuse(ERROR_CODES.PASSWORD_TOO_LONG, field, 'The password is longer than can be used.');
  }

  for (const requirement of PASSWORD.requirements) {
    if (!requirement.pattern.test(password)) {
      refuse(requirement.code, field, `The password must contain ${requirement.description}.`);
    }
  }

  return password;
}

// The only rule the web cannot mirror: whether the thing named actually exists.
// An optional reference is one of a pair the form accepts instead of the other,
// such as an activity chosen from the catalog or one written out by hand.
async function readReference(body, field, model, { required = true } = {}) {
  const id = readText(body, field, { required });

  if (id === undefined) {
    return undefined;
  }

  if (!PATTERNS.objectId.test(id)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The field ${field} is not a valid reference.`);
  }

  const found = await model.findById(id).select('_id').lean();

  if (found === null) {
    refuse(
      ERROR_CODES.UNKNOWN_REFERENCE,
      field,
      `The field ${field} does not name anything that exists.`,
    );
  }

  return found._id;
}

// A date is a calendar day, not an instant: the day a certification was issued
// is that day everywhere, so it travels as text and is stored at UTC midnight.
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readCalendarDate(body, field, { required }) {
  const value = readText(body, field, { required });

  if (value === undefined) {
    return undefined;
  }

  if (!CALENDAR_DATE.test(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The field ${field} must be a calendar date.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  // A well-shaped but impossible day, such as 31 February, rolls forward.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The field ${field} is not a real date.`);
  }

  return parsed;
}

function readFileKey(body, field, { required }) {
  const key = readText(body, field, { required });

  if (key === undefined) {
    return undefined;
  }

  // A driver joins this onto a directory, so a key that climbs out of it would
  // let a caller name somebody else's file.
  if (key.includes('..')) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The field ${field} is not a stored file.`);
  }

  return key;
}

// Consent is neither text nor a choice: it is a yes. A missing box, an absent
// object and a refusal all look the same from here.
function readConsent(consents, field) {
  if (consents === null || typeof consents !== 'object' || consents[field] !== true) {
    refuse(ERROR_CODES.CONSENTS_REQUIRED, field, `The consent ${field} is required.`);
  }

  return true;
}

module.exports = {
  readText,
  readChoice,
  readPassword,
  readReference,
  readCalendarDate,
  readFileKey,
  readConsent,
  ValidationError,
  refuse,
  FIELDS,
  PATTERNS,
  PASSWORD,
};
