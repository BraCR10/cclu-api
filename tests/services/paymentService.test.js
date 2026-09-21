const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerPayment,
  listOwnPayments,
  listPendingPayments,
  approvePayment,
  rejectPayment,
  listMemberPayments,
  listMemberships,
} = require('../../src/services/paymentService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const ADMIN_ID = '65f0c3a1b2c3d4e5f6a7b8ca';
const PAYMENT_ID = '65f0c3a1b2c3d4e5f6a7b8cb';
const RECEIPT_KEY = 'payment-receipts/65f0c3a1b2c3d4e5f6a7b8c9/x.pdf';
const SIGNED_URL = 'https://storage.example/signed-for-a-short-while';

const sign = async () => SIGNED_URL;

function payment(overrides = {}) {
  return {
    _id: PAYMENT_ID,
    member: MEMBER_ID,
    receiptKey: RECEIPT_KEY,
    paidAt: new Date('2026-09-20T00:00:00.000Z'),
    detail: 'Transferencia SINPE',
    amount: 15000,
    status: 'pending_review',
    reviewedAt: null,
    createdAt: new Date('2026-09-20T12:00:00.000Z'),
    ...overrides,
  };
}

function registration(overrides = {}) {
  return {
    contentType: 'application/pdf',
    content: 'ZmFrZSByZWNlaXB0',
    paidAt: '2026-09-20',
    detail: 'Transferencia SINPE',
    ...overrides,
  };
}

const fee = async () => ({ amount: 15000 });
const upload = async () => ({ key: RECEIPT_KEY });
const noAdmins = async () => [];
const member = async () => ({ businessName: 'Panadería Tres Ríos', email: 'socio@example.cr' });

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a payment is registered pending, with the configured amount copied in', async () => {
  const saved = [];
  const save = async (fields) => {
    saved.push(fields);
    return payment(fields);
  };

  const answer = await registerPayment(
    MEMBER_ID,
    registration(),
    fee,
    upload,
    save,
    member,
    noAdmins,
    async () => true,
    sign,
  );

  assert.equal(saved[0].member, MEMBER_ID);
  assert.equal(saved[0].amount, 15000);
  assert.equal(saved[0].receiptKey, RECEIPT_KEY);
  assert.equal(answer.status, 'pending_review');
  assert.equal(answer.receiptUrl, SIGNED_URL);
});

test('without a configured fee no payment can be registered', async () => {
  const error = await refusal(() => registerPayment(MEMBER_ID, registration(), async () => null));

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, 'fee_not_configured');
});

test('a payment date that is not a date is refused before anything is stored', async () => {
  for (const paidAt of [undefined, null, 'ayer', 42]) {
    const error = await refusal(() =>
      registerPayment(MEMBER_ID, registration({ paidAt }), fee, async () => {
        throw new Error('nothing should be uploaded for an invalid registration');
      }),
    );

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'paidAt');
  }
});

test('every active administrator is told about the new pending payment', async () => {
  const notified = [];
  const admins = async () => [{ email: 'a@cclu.cr' }, { email: 'b@cclu.cr' }];
  const notify = async (template, recipient) => {
    notified.push({ template, recipient });
    return true;
  };

  await registerPayment(
    MEMBER_ID,
    registration(),
    fee,
    upload,
    async (fields) => payment(fields),
    member,
    admins,
    notify,
    sign,
  );

  assert.deepEqual(notified, [
    { template: 'paymentSubmitted', recipient: 'a@cclu.cr' },
    { template: 'paymentSubmitted', recipient: 'b@cclu.cr' },
  ]);
});

test('a member reads their own payments with the receipt freshly signed', async () => {
  const answer = await listOwnPayments(MEMBER_ID, async () => [payment()], sign);

  assert.equal(answer.length, 1);
  assert.equal(answer[0].receiptUrl, SIGNED_URL);
  assert.equal(answer[0].amount, 15000);
});

test('the pending queue carries who is paying beside each receipt', async () => {
  const pending = [
    payment({
      member: {
        _id: MEMBER_ID,
        businessName: 'Panadería Tres Ríos',
        memberCode: 'MA7K2Q4',
        email: 'socio@example.cr',
      },
    }),
  ];

  const answer = await listPendingPayments(async () => pending, sign);

  assert.deepEqual(answer[0].member, {
    id: MEMBER_ID,
    businessName: 'Panadería Tres Ríos',
    memberCode: 'MA7K2Q4',
    email: 'socio@example.cr',
  });
});

test('approving a payment extends the membership one month from the approval', async () => {
  const savedUntil = [];
  const decided = payment({ status: 'approved' });
  const before = Date.now();

  const answer = await approvePayment(
    PAYMENT_ID,
    ADMIN_ID,
    async () => decided,
    async () => decided,
    async (memberId, paidUntil) => savedUntil.push({ memberId, paidUntil }),
    member,
    async () => true,
  );

  assert.equal(answer.status, 'approved');
  assert.equal(savedUntil[0].memberId, MEMBER_ID);

  const oneMonthAhead = new Date(before);
  oneMonthAhead.setMonth(oneMonthAhead.getMonth() + 1);
  const drift = Math.abs(savedUntil[0].paidUntil.getTime() - oneMonthAhead.getTime());

  assert.ok(drift < 60 * 1000, 'paidUntil is not one month from the approval');
});

test('the member is told their renewal was accepted', async () => {
  const notified = [];
  const decided = payment({ status: 'approved' });

  await approvePayment(
    PAYMENT_ID,
    ADMIN_ID,
    async () => decided,
    async () => decided,
    async () => {},
    member,
    async (template, recipient) => notified.push({ template, recipient }),
  );

  assert.deepEqual(notified, [{ template: 'paymentApproved', recipient: 'socio@example.cr' }]);
});

test('a payment already decided cannot be decided again', async () => {
  const error = await refusal(() =>
    approvePayment(
      PAYMENT_ID,
      ADMIN_ID,
      async () => null,
      async () => payment({ status: 'approved' }),
    ),
  );

  assert.equal(error.statusCode, 409);
  assert.equal(error.reason, 'approved');
});

test('a payment that never existed answers not found', async () => {
  const error = await refusal(() =>
    approvePayment(
      PAYMENT_ID,
      ADMIN_ID,
      async () => null,
      async () => null,
    ),
  );

  assert.equal(error.statusCode, 404);
});

test('rejecting a payment requires a reason and tells the member why', async () => {
  const notified = [];
  const decided = payment({ status: 'rejected', statusReason: 'El monto no coincide' });

  const answer = await rejectPayment(
    PAYMENT_ID,
    ADMIN_ID,
    { reason: 'El monto no coincide' },
    async () => decided,
    async () => decided,
    member,
    async (template, recipient) => notified.push({ template, recipient }),
  );

  assert.equal(answer.status, 'rejected');
  assert.deepEqual(notified, [{ template: 'paymentRejected', recipient: 'socio@example.cr' }]);

  const error = await refusal(() => rejectPayment(PAYMENT_ID, ADMIN_ID, {}));

  assert.equal(error.statusCode, 400);
  assert.equal(error.field, 'reason');
});

test('an administrator reads any member history, but only of members that exist', async () => {
  const answer = await listMemberPayments(
    MEMBER_ID,
    async () => ({ _id: MEMBER_ID }),
    async () => [payment()],
    sign,
  );

  assert.equal(answer.length, 1);

  const error = await refusal(() => listMemberPayments(MEMBER_ID, async () => null));

  assert.equal(error.statusCode, 404);
});

test('the membership roll separates active from inactive by the paid date alone', async () => {
  const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const members = async () => [
    {
      _id: MEMBER_ID,
      businessName: 'Al día',
      memberCode: 'MA7K2Q4',
      email: 'a@x.cr',
      paidUntil: inAMonth,
      canton: { name: 'La Unión' },
      sector: { name: 'Comercio' },
    },
    {
      _id: ADMIN_ID,
      businessName: 'Vencido',
      memberCode: 'MB8L3R5',
      email: 'b@x.cr',
      paidUntil: new Date('2026-01-01'),
      canton: null,
      sector: null,
    },
  ];

  const all = await listMemberships({}, members);
  const active = await listMemberships({ state: 'active' }, members);
  const inactive = await listMemberships({ state: 'inactive' }, members);

  assert.equal(all.length, 2);
  assert.deepEqual(
    active.map((row) => row.member.businessName),
    ['Al día'],
  );
  assert.deepEqual(
    inactive.map((row) => row.member.businessName),
    ['Vencido'],
  );
  assert.equal(active[0].type, 'paid');
  assert.equal(inactive[0].type, 'free');
  assert.equal(inactive[0].paidUntil, null);
});
