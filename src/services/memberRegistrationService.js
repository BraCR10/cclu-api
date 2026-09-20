const { Member, MEMBER_TYPES, IDENTIFICATION_TYPES } = require('../models/Member');
const { ROLES } = require('../config/roles');
const accountService = require('./accountService');
const { Canton } = require('../models/Canton');
const { Sector } = require('../models/Sector');
const passwordService = require('./passwordService');
const {
  readText,
  readChoice,
  readPassword,
  readReference,
  ValidationError,
  refuse,
  CODES,
} = require('../config/memberRules');

// Named one by one, and nothing outside this list is ever read. Spreading the
// body would let a caller set their own role or arrive already approved.
const REQUIRED_TEXT_FIELDS = [
  'email',
  'phone',
  'location',
  'identificationNumber',
  'businessName',
  'businessDescription',
];

const OPTIONAL_TEXT_FIELDS = ['whatsappNumber', 'instagram', 'facebook', 'linkedin'];

// Rendered as links later, so the scheme is checked there rather than trusted
// to whatever displays them.
const OPTIONAL_LINK_FIELDS = ['logoUrl', 'website'];

const REQUIRED_REFERENCE_FIELDS = [
  { field: 'canton', model: Canton },
  { field: 'sector', model: Sector },
];

const CHOICE_FIELDS = [
  { field: 'memberType', allowed: Object.values(MEMBER_TYPES) },
  { field: 'identificationType', allowed: Object.values(IDENTIFICATION_TYPES) },
];

async function buildRegistration(body, references = REQUIRED_REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The registration body is missing.');
  }

  const registration = {};

  for (const field of REQUIRED_TEXT_FIELDS) {
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

  for (const { field, allowed } of CHOICE_FIELDS) {
    registration[field] = readChoice(body, field, allowed);
  }

  // Read before the references, so a body that was never going to be accepted
  // costs no lookups.
  const password = readPassword(body);

  const found = await Promise.all(
    references.map(({ field, model }) => readReference(body, field, model)),
  );

  references.forEach(({ field }, index) => {
    registration[field] = found[index];
  });

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
    CODES.ALREADY_REGISTERED,
    null,
    'The registration could not be completed. Contact the chamber for help.',
    409,
  );
}

async function registerMember(
  body,
  create = (document) => Member.create(document),
  references = REQUIRED_REFERENCE_FIELDS,
  heldByAnotherRole = accountService.emailHeldByAnotherRole,
) {
  const registration = await buildRegistration(body, references);

  // The index below cannot see the administrators, so an address one of them
  // holds is refused here instead, in the same words.
  if (await heldByAnotherRole(registration.email, ROLES.MEMBER)) {
    throw alreadyRegistered();
  }

  try {
    const member = await create(registration);

    return { id: String(member._id) };
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      throw alreadyRegistered();
    }

    throw error;
  }
}

module.exports = { registerMember, buildRegistration };
