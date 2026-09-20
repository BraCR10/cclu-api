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
  minimumLength: 8,
  maximumBytes: 72,
  requirements: [
    { code: 'password_needs_letter', pattern: /\p{L}/u, description: 'a letter' },
    { code: 'password_needs_digit', pattern: /\p{Nd}/u, description: 'a number' },
    { code: 'password_needs_special', pattern: /[^\p{L}\p{Nd}]/u, description: 'a symbol' },
  ],
};

// The code is what the web reads to decide which message to show; the message
// is for a log and for whoever is holding a terminal.
const CODES = {
  REQUIRED: 'required',
  NOT_TEXT: 'not_text',
  TOO_LONG: 'too_long',
  INVALID_FORMAT: 'invalid_format',
  NOT_ALLOWED: 'not_allowed',
  UNKNOWN_REFERENCE: 'unknown_reference',
  PASSWORD_TOO_SHORT: 'password_too_short',
  PASSWORD_TOO_LONG: 'password_too_long',
  PASSWORD_NEEDS_LETTER: 'password_needs_letter',
  PASSWORD_NEEDS_DIGIT: 'password_needs_digit',
  PASSWORD_NEEDS_SPECIAL: 'password_needs_special',
  NOTHING_TO_CHANGE: 'nothing_to_change',
  ALREADY_REGISTERED: 'already_registered',
  INVALID_CURRENT_PASSWORD: 'invalid_current_password',
  INVALID_CODE: 'invalid_code',
  BODY_MISSING: 'body_missing',
};

class ValidationError extends Error {
  constructor(code, field, message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }
}

function refuse(code, field, message) {
  throw new ValidationError(code, field, message);
}

function readText(body, field, { required }) {
  const rule = FIELDS[field] ?? {};
  const value = body[field];

  if (value === undefined || value === null || value === '') {
    if (required) {
      refuse(CODES.REQUIRED, field, `The field ${field} is required.`);
    }

    return undefined;
  }

  // A value that is not a string stops being data and becomes part of the
  // query, because MongoDB reads $ and . as operators.
  if (typeof value !== 'string') {
    refuse(CODES.NOT_TEXT, field, `The field ${field} must be text.`);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    if (required) {
      refuse(CODES.REQUIRED, field, `The field ${field} is required.`);
    }

    return undefined;
  }

  if (rule.maxLength !== undefined && trimmed.length > rule.maxLength) {
    refuse(CODES.TOO_LONG, field, `The field ${field} is longer than ${rule.maxLength}.`);
  }

  if (rule.pattern !== undefined && !PATTERNS[rule.pattern].test(trimmed)) {
    refuse(CODES.INVALID_FORMAT, field, `The field ${field} is not in the expected format.`);
  }

  return trimmed;
}

function readChoice(body, field, allowed) {
  const value = readText(body, field, { required: true });

  if (!allowed.includes(value)) {
    refuse(CODES.NOT_ALLOWED, field, `The field ${field} is not one of the accepted values.`);
  }

  return value;
}

function readPassword(body, field = 'password') {
  const password = body[field];

  if (typeof password !== 'string' || password.length < PASSWORD.minimumLength) {
    refuse(
      CODES.PASSWORD_TOO_SHORT,
      field,
      `The password must be at least ${PASSWORD.minimumLength} characters.`,
    );
  }

  if (Buffer.byteLength(password, 'utf8') > PASSWORD.maximumBytes) {
    refuse(CODES.PASSWORD_TOO_LONG, field, 'The password is longer than can be used.');
  }

  for (const requirement of PASSWORD.requirements) {
    if (!requirement.pattern.test(password)) {
      refuse(requirement.code, field, `The password must contain ${requirement.description}.`);
    }
  }

  return password;
}

// The only rule the web cannot mirror: whether the thing named actually exists.
async function readReference(body, field, model) {
  const id = readText(body, field, { required: true });

  if (!PATTERNS.objectId.test(id)) {
    refuse(CODES.INVALID_FORMAT, field, `The field ${field} is not a valid reference.`);
  }

  const found = await model.findById(id).select('_id').lean();

  if (found === null) {
    refuse(
      CODES.UNKNOWN_REFERENCE,
      field,
      `The field ${field} does not name anything that exists.`,
    );
  }

  return found._id;
}

module.exports = {
  readText,
  readChoice,
  readPassword,
  readReference,
  ValidationError,
  refuse,
  CODES,
  FIELDS,
  PATTERNS,
  PASSWORD,
};
