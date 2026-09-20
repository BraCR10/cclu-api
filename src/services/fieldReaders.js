const MAXIMUM_TEXT_LENGTH = 500;

// Stored to be rendered as links later, so a javascript: or data: value is kept
// out now rather than trusted to whatever displays it.
const SAFE_LINK = /^https?:\/\//i;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// The same readers serve registration and profile editing. Each caller supplies
// the error its own layer answers with, so the messages stay in one vocabulary.
function createFieldReaders(FailureError) {
  function readText(body, field, { required }) {
    const value = body[field];

    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new FailureError(`The field ${field} is required.`);
      }

      return undefined;
    }

    // A value that is not a string stops being data and becomes part of the
    // query, because MongoDB reads $ and . as operators.
    if (typeof value !== 'string') {
      throw new FailureError(`The field ${field} must be text.`);
    }

    const trimmed = value.trim();

    if (trimmed === '') {
      if (required) {
        throw new FailureError(`The field ${field} is required.`);
      }

      return undefined;
    }

    if (trimmed.length > MAXIMUM_TEXT_LENGTH) {
      throw new FailureError(`The field ${field} is longer than allowed.`);
    }

    return trimmed;
  }

  function readChoice(body, field, allowed) {
    const value = readText(body, field, { required: true });

    if (!allowed.includes(value)) {
      throw new FailureError(`The field ${field} is not one of the accepted values.`);
    }

    return value;
  }

  function readLink(body, field, { required }) {
    const value = readText(body, field, { required });

    if (value !== undefined && !SAFE_LINK.test(value)) {
      throw new FailureError(`The field ${field} must be a web address.`);
    }

    return value;
  }

  async function readReference(body, field, model) {
    const id = readText(body, field, { required: true });

    if (!OBJECT_ID.test(id)) {
      throw new FailureError(`The field ${field} is not a valid reference.`);
    }

    const found = await model.findById(id).select('_id').lean();

    if (found === null) {
      throw new FailureError(`The field ${field} does not name anything that exists.`);
    }

    return found._id;
  }

  return { readText, readChoice, readLink, readReference };
}

module.exports = { createFieldReaders, MAXIMUM_TEXT_LENGTH, SAFE_LINK, OBJECT_ID };
