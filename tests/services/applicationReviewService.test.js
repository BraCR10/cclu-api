const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approveApplication,
  rejectApplication,
  MAXIMUM_CODE_ATTEMPTS,
} = require('../../src/services/applicationReviewService');
const { isMemberCodeValid } = require('../../src/services/memberCodeService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const REVIEWER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const DUPLICATE_KEY = 11000;

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

const findingNothing = async () => null;
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

  await rejectApplication(MEMBER_ID, REVIEWER_ID, { reason: 'Unverifiable address.' }, decide);

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
  assert.deepEqual($unset, { statusReason: '' });
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

  await rejectApplication(MEMBER_ID, REVIEWER_ID, { reason: '  Unverifiable address.  ' }, decide);

  const { $set } = calls[0].changes;

  assert.equal($set.applicationStatus, APPLICATION_STATUSES.REJECTED);
  assert.equal($set.statusReason, 'Unverifiable address.');
  assert.equal($set.memberCode, undefined);
  assert.equal($set.reviewedBy, REVIEWER_ID);
  assert.ok($set.reviewedAt instanceof Date);
});
