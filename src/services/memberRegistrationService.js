const { Member, MEMBER_TYPES, IDENTIFICATION_TYPES } = require('../models/Member');
const { Canton } = require('../models/Canton');
const { Sector } = require('../models/Sector');
const passwordService = require('./passwordService');
const { createFieldReaders } = require('./fieldReaders');

const MINIMUM_PASSWORD_LENGTH = 12;

// bcrypt reads no further than the 72nd byte. Accepting more would let someone
// believe the tail of their password counts for something.
const MAXIMUM_PASSWORD_BYTES = 72;

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

class RegistrationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'RegistrationError';
    this.statusCode = statusCode;
  }
}

const { readText, readChoice, readLink, readReference } = createFieldReaders(RegistrationError);

function readPassword(body) {
  const password = body.password;

  if (typeof password !== 'string' || password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new RegistrationError(
      `The password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }

  if (Buffer.byteLength(password, 'utf8') > MAXIMUM_PASSWORD_BYTES) {
    throw new RegistrationError('The password is longer than can be used.');
  }

  return password;
}

async function buildRegistration(body, references = REQUIRED_REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RegistrationError('The registration body is missing.');
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
    const value = readLink(body, field, { required: false });

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

async function registerMember(
  body,
  create = (document) => Member.create(document),
  references = REQUIRED_REFERENCE_FIELDS,
) {
  const registration = await buildRegistration(body, references);

  try {
    const member = await create(registration);

    return { id: String(member._id) };
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      // Saying which identifier collided would confirm to a stranger that it
      // belongs to a member of the chamber.
      throw new RegistrationError(
        'The registration could not be completed. Contact the chamber for help.',
        409,
      );
    }

    throw error;
  }
}

module.exports = { registerMember, buildRegistration, RegistrationError };
