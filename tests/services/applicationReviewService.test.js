const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approveApplication,
  approveMatchingApplication,
  rejectApplication,
  requestChangesApplication,
  MAXIMUM_CODE_ATTEMPTS,
} = require('../../src/services/applicationReviewService');
const { isMemberCodeValid } = require('../../src/services/memberCodeService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const REVIEWER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const DUPLICATE_KEY = 11000;
const TOKEN = 'a'.repeat(64);

function recordingDecide(result = { applicationStatus: APPLICATION_STATUSES.APPROVED }) {
  const calls = [];

  return {
    calls,
    decide: async (filter, changes) => {
      calls.push({ filter, changes });
      return result;
    },
  };
}

// Every message that leaves is kept, so what the applicant is told can be
// asserted rather than assumed.
function recordingNotify(answer = true) {
  const messages = [];

  return {
    messages,
    notify: async (templateName, recipient, data) => {
      messages.push({ templateName, recipient, data });
      return answer;
    },
  };
}

const findingNothing = async () => null;
const issuingToken = async () => ({ token: TOKEN });
const silentNotify = async () => true;
const recordingActivity = async () => {};
const findingStatus = (applicationStatus) => async () => ({ applicationStatus });

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('an approval only matches an application that is still pending', async () => {
  const { calls, decide } = recordingDecide();

  await approveApplication(MEMBER_ID, REVIEWER_ID, decide, findingNothing);

  assert.deepEqual(calls[0].filter, {
    _id: MEMBER_ID,
    applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW,
  });
});

test('a rejection only matches an application that is still pending', async () => {
  const { calls, decide } = recordingDecide({ applicationStatus: APPLICATION_STATUSES.REJECTED });

  await rejectApplication(
    MEMBER_ID,
    REVIEWER_ID,
    { reason: 'Unverifiable address.' },
    decide,
    findingNothing,
    issuingToken,
    silentNotify,
  );

  assert.deepEqual(calls[0].filter, {
    _id: MEMBER_ID,
    applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW,
  });
});

test('an approval assigns a valid member code and records who decided', async () => {
  const { calls, decide } = recordingDecide();

  await approveApplication(MEMBER_ID, REVIEWER_ID, decide, findingNothing);

  const { $set, $unset } = calls[0].changes;

  assert.equal($set.applicationStatus, APPLICATION_STATUSES.APPROVED);
  assert.equal(isMemberCodeValid($set.memberCode), true);
  assert.equal($set.reviewedBy, REVIEWER_ID);
  assert.ok($set.reviewedAt instanceof Date);
  assert.deepEqual($unset, { statusReason: '', changesRequestedFields: '' });
});

test('a duplicate code is answered by drawing another one', async () => {
  const drawn = ['MA7K2Q4', 'MA7K2Q4', 'MB3N5R8'];
  let index = 0;
  const attempted = [];

  const decide = async (filter, changes) => {
    attempted.push(changes.$set.memberCode);

    if (attempted.length < 3) {
      const error = new Error('E11000 duplicate key error');
      error.code = DUPLICATE_KEY;
      throw error;
    }

    return { memberCode: changes.$set.memberCode };
  };

  const approved = await approveApplication(MEMBER_ID, REVIEWER_ID, decide, findingNothing, () => {
    const code = drawn[index];
    index += 1;
    return code;
  });

  assert.equal(attempted.length, 3);
  assert.equal(approved.memberCode, 'MB3N5R8');
});

test('a code is never looked up before being written', async () => {
  let statusLookups = 0;
  const { decide } = recordingDecide();

  await approveApplication(MEMBER_ID, REVIEWER_ID, decide, async () => {
    statusLookups += 1;
    return null;
  });

  assert.equal(statusLookups, 0);
});

test('endless collisions stop rather than loop', async () => {
  let attempts = 0;

  const error = await refusal(() =>
    approveApplication(
      MEMBER_ID,
      REVIEWER_ID,
      async () => {
        attempts += 1;
        const duplicate = new Error('E11000 duplicate key error');
        duplicate.code = DUPLICATE_KEY;
        throw duplicate;
      },
      findingNothing,
    ),
  );

  assert.equal(attempts, MAXIMUM_CODE_ATTEMPTS);
  assert.equal(error.statusCode, 500);
});

test('a failure that is not a collision is not retried', async () => {
  let attempts = 0;

  const error = await refusal(() =>
    approveApplication(
      MEMBER_ID,
      REVIEWER_ID,
      async () => {
        attempts += 1;
        throw new Error('the cluster is unreachable');
      },
      findingNothing,
    ),
  );

  assert.equal(attempts, 1);
  assert.equal(error.message, 'the cluster is unreachable');
});

test('a decision on something that does not exist is a not found', async () => {
  for (const decide of [
    () => approveApplication(MEMBER_ID, REVIEWER_ID, async () => null, findingNothing),
    () =>
      rejectApplication(
        MEMBER_ID,
        REVIEWER_ID,
        { reason: 'Unverifiable address.' },
        async () => null,
        findingNothing,
      ),
  ]) {
    const error = await refusal(decide);

    assert.equal(error.statusCode, 404);
  }
});

test('a decision on a settled application says which state it is in', async () => {
  const error = await refusal(() =>
    approveApplication(
      MEMBER_ID,
      REVIEWER_ID,
      async () => null,
      findingStatus(APPLICATION_STATUSES.REJECTED),
    ),
  );

  assert.equal(error.statusCode, 409);
  assert.equal(error.reason, APPLICATION_STATUSES.REJECTED);
});

test('an identifier that is not one is refused before anything is read', async () => {
  for (const identifier of [undefined, null, '', 'not-an-identifier', { $ne: null }, 42]) {
    let touched = false;

    const error = await refusal(() =>
      approveApplication(identifier, REVIEWER_ID, async () => {
        touched = true;
        return null;
      }),
    );

    assert.equal(error.statusCode, 400);
    assert.equal(touched, false);
  }
});

test('a rejection without a reason is refused', async () => {
  for (const body of [undefined, null, {}, { reason: '' }, { reason: '   ' }, { reason: 12 }]) {
    let touched = false;

    const error = await refusal(() =>
      rejectApplication(MEMBER_ID, REVIEWER_ID, body, async () => {
        touched = true;
        return null;
      }),
    );

    assert.equal(error.statusCode, 400);
    assert.equal(touched, false);
  }
});

test('an operator in the reason never reaches the update', async () => {
  let touched = false;

  await refusal(() =>
    rejectApplication(MEMBER_ID, REVIEWER_ID, { reason: { $ne: null } }, async () => {
      touched = true;
      return null;
    }),
  );

  assert.equal(touched, false);
});

test('a reason longer than allowed is refused', async () => {
  const error = await refusal(() =>
    rejectApplication(MEMBER_ID, REVIEWER_ID, { reason: 'x'.repeat(501) }, async () => null),
  );

  assert.equal(error.statusCode, 400);
});

test('a rejection stores the trimmed reason and draws no member code', async () => {
  const { calls, decide } = recordingDecide({ applicationStatus: APPLICATION_STATUSES.REJECTED });

  await rejectApplication(
    MEMBER_ID,
    REVIEWER_ID,
    { reason: '  Unverifiable address.  ' },
    decide,
    findingNothing,
    issuingToken,
    silentNotify,
  );

  const { $set } = calls[0].changes;

  assert.equal($set.applicationStatus, APPLICATION_STATUSES.REJECTED);
  assert.equal($set.statusReason, 'Unverifiable address.');
  assert.equal($set.memberCode, undefined);
  assert.equal($set.reviewedBy, REVIEWER_ID);
  assert.ok($set.reviewedAt instanceof Date);
});

test('every refusal of a decision carries a registered code', async () => {
  const invalidIdentifier = await refusal(() => approveApplication('nope', REVIEWER_ID));
  const missingReason = await refusal(() => rejectApplication(MEMBER_ID, REVIEWER_ID, {}));
  const longReason = await refusal(() =>
    rejectApplication(MEMBER_ID, REVIEWER_ID, { reason: 'x'.repeat(501) }),
  );
  const missing = await refusal(() =>
    approveApplication(MEMBER_ID, REVIEWER_ID, async () => null, findingNothing),
  );
  const settled = await refusal(() =>
    approveApplication(
      MEMBER_ID,
      REVIEWER_ID,
      async () => null,
      findingStatus(APPLICATION_STATUSES.APPROVED),
    ),
  );
  const changesWithoutReason = await refusal(() =>
    requestChangesApplication(MEMBER_ID, REVIEWER_ID, {
      fields: [{ field: 'district', message: 'algo.' }],
    }),
  );
  const uncorrectable = await refusal(() =>
    requestChangesApplication(MEMBER_ID, REVIEWER_ID, {
      reason: 'Algo.',
      fields: [{ field: 'email', message: 'algo.' }],
    }),
  );
  const withoutAFieldReason = await refusal(() =>
    requestChangesApplication(MEMBER_ID, REVIEWER_ID, {
      reason: 'Algo.',
      fields: [{ field: 'district' }],
    }),
  );

  assert.equal(invalidIdentifier.code, 'invalid_format');
  assert.deepEqual([missingReason.code, missingReason.field], ['required', 'reason']);
  assert.deepEqual([longReason.code, longReason.field], ['too_long', 'reason']);
  assert.equal(missing.code, 'unknown_reference');
  assert.equal(settled.code, 'already_decided');
  assert.deepEqual([changesWithoutReason.code, changesWithoutReason.field], ['required', 'reason']);
  assert.deepEqual([uncorrectable.code, uncorrectable.field], ['not_allowed', 'fields']);
  assert.deepEqual([withoutAFieldReason.code, withoutAFieldReason.field], ['required', 'fields']);
});

test('a request for changes only matches an application that is still pending', async () => {
  const { calls, decide } = recordingDecide({
    applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
  });

  await requestChangesApplication(
    MEMBER_ID,
    REVIEWER_ID,
    {
      reason: 'La dirección no se pudo verificar.',
      fields: [{ field: 'district', message: 'no coincide con el cantón.' }],
    },
    decide,
    findingNothing,
    issuingToken,
    silentNotify,
  );

  assert.deepEqual(calls[0].filter, {
    _id: MEMBER_ID,
    applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW,
  });
});

// The middle answer: neither accepted nor refused, so nothing is closed and no
// member code is drawn.
test('a request for changes keeps the application and says what to fix', async () => {
  const { calls, decide } = recordingDecide({
    applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
  });

  await requestChangesApplication(
    MEMBER_ID,
    REVIEWER_ID,
    {
      reason: '  La dirección no se pudo verificar.  ',
      fields: [
        { field: 'district', message: 'no coincide con el cantón.' },
        { field: 'phone', message: 'tiene un dígito de más.' },
        { field: 'district', message: 'repetido, y con otro motivo.' },
      ],
    },
    decide,
    findingNothing,
    issuingToken,
    silentNotify,
  );

  const { $set } = calls[0].changes;

  assert.equal($set.applicationStatus, APPLICATION_STATUSES.CHANGES_REQUESTED);
  assert.equal($set.statusReason, 'La dirección no se pudo verificar.');
  // A field asked for twice is one field with the first reason it was given.
  assert.deepEqual($set.changesRequestedFields, [
    { field: 'district', message: 'no coincide con el cantón.' },
    { field: 'phone', message: 'tiene un dígito de más.' },
  ]);
  assert.equal($set.memberCode, undefined);
  assert.equal($set.reviewedBy, REVIEWER_ID);
  assert.ok($set.reviewedAt instanceof Date);
});

test('only a field the correction form can show may be asked for', async () => {
  let touched = false;

  for (const fields of [
    'district',
    ['district'],
    [{ field: 'email', message: 'algo.' }],
    [{ field: 'billingEmail', message: 'algo.' }],
    [{ field: 'nope', message: 'algo.' }],
    [{ field: 12, message: 'algo.' }],
  ]) {
    const error = await refusal(() =>
      requestChangesApplication(
        MEMBER_ID,
        REVIEWER_ID,
        { reason: 'Algo que corregir.', fields },
        async () => {
          touched = true;
          return null;
        },
      ),
    );

    assert.equal(error.statusCode, 400);
  }

  assert.equal(touched, false);
});

// Somebody told to fix a field and not told what is wrong with it has nowhere to
// look, so the reason travels with the field or neither does.
test('a field named without a reason is refused', async () => {
  let touched = false;

  for (const fields of [
    [{ field: 'district' }],
    [{ field: 'district', message: '' }],
    [{ field: 'district', message: '   ' }],
    [{ field: 'district', message: 12 }],
    [{ field: 'district', message: 'x'.repeat(201) }],
  ]) {
    const error = await refusal(() =>
      requestChangesApplication(
        MEMBER_ID,
        REVIEWER_ID,
        { reason: 'Algo que corregir.', fields },
        async () => {
          touched = true;
          return null;
        },
      ),
    );

    assert.equal(error.statusCode, 400);
    assert.deepEqual([error.field, error.reason], ['fields', 'district']);
  }

  assert.equal(touched, false);
});

test('an approval tells the applicant their member code', async () => {
  const { decide } = recordingDecide({
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
    businessName: 'Panadería Tres Ríos',
  });
  const { messages, notify } = recordingNotify();

  const approved = await approveApplication(
    MEMBER_ID,
    REVIEWER_ID,
    decide,
    findingNothing,
    undefined,
    recordingActivity,
    notify,
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].templateName, 'applicationApproved');
  assert.equal(messages[0].recipient, 'socio@example.cr');
  assert.equal(messages[0].data.memberCode, 'MA7K2Q4');
  assert.equal(messages[0].data.businessName, 'Panadería Tres Ríos');
  assert.equal(approved.notified, true);
});

// A message that does not leave is reported, never undone: the applicant is
// affiliated whether or not the mail server answered.
test('an approval stands when its message cannot leave', async () => {
  const { decide } = recordingDecide({
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    memberCode: 'MA7K2Q4',
  });

  const approved = await approveApplication(
    MEMBER_ID,
    REVIEWER_ID,
    decide,
    findingNothing,
    undefined,
    recordingActivity,
    async () => false,
  );

  assert.equal(approved.applicationStatus, APPLICATION_STATUSES.APPROVED);
  assert.equal(approved.notified, false);
});

test('a request for changes hands over the same link a rejection does', async () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = 'https://cclu.example.cr/';

  try {
    const { decide } = recordingDecide({
      applicationStatus: APPLICATION_STATUSES.CHANGES_REQUESTED,
      email: 'socio@example.cr',
      businessName: 'Panadería Tres Ríos',
    });
    const { messages, notify } = recordingNotify();
    const named = [{ field: 'identificationNumber', message: 'no coincide con la razón social.' }];

    const reviewed = await requestChangesApplication(
      MEMBER_ID,
      REVIEWER_ID,
      { reason: 'La cédula jurídica no coincide con el nombre comercial.', fields: named },
      decide,
      findingNothing,
      issuingToken,
      notify,
    );

    assert.equal(messages[0].templateName, 'applicationChangesRequested');
    assert.equal(messages[0].recipient, 'socio@example.cr');
    assert.equal(
      messages[0].data.reason,
      'La cédula jurídica no coincide con el nombre comercial.',
    );
    assert.deepEqual(messages[0].data.fields, named);
    assert.equal(messages[0].data.resubmitUrl, `https://cclu.example.cr/resubmit/${TOKEN}`);
    // The address and the name were read to send the message, not to answer
    // with.
    assert.equal(reviewed.email, undefined);
    assert.equal(reviewed.businessName, undefined);
    assert.equal(reviewed.notified, true);
  } finally {
    if (previous === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = previous;
    }
  }
});

test('an approval stands, code and all, when granting Gratuita fails', async () => {
  const approved = { _id: MEMBER_ID, memberCode: 'MA7K2Q4', reviewedAt: new Date() };

  const result = await approveMatchingApplication(
    {},
    {},
    async () => {
      throw new Error('Atlas unreachable');
    },
    async () => approved,
  );

  assert.equal(result, approved);
});

test('an approval grants Gratuita to the member it approved', async () => {
  const granted = [];
  const reviewedAt = new Date();

  await approveMatchingApplication(
    {},
    {},
    async (memberId, startedAt) => granted.push({ memberId, startedAt }),
    async () => ({ _id: MEMBER_ID, reviewedAt }),
  );

  assert.deepEqual(granted, [{ memberId: MEMBER_ID, startedAt: reviewedAt }]);
});
