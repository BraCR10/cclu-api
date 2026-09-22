const test = require('node:test');
const assert = require('node:assert/strict');
const { sendEmail, notify, EmailDeliveryError } = require('../../src/services/emailService');
const { renderTemplate, UnknownTemplateError, TEMPLATE_NAMES } = require('../../src/emails');
const { readMailerConfig, MailerConfigurationError } = require('../../src/config/mailer');

const CONFIGURED = {
  SMTP_HOST: 'smtp.example.cr',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'cclu',
  SMTP_PASSWORD: 'a-password',
  MAIL_FROM: 'Cámara <no-reply@cclu.cr>',
};

function transportThat(behaviour) {
  const sent = [];

  return {
    sent,
    open: () => ({
      from: CONFIGURED.MAIL_FROM,
      transport: {
        sendMail: async (message) => {
          sent.push(message);
          return behaviour(message);
        },
      },
    }),
  };
}

const delivers = () => ({ messageId: 'abc' });
const fails = () => {
  throw new Error('connection refused');
};

test('the configuration names every variable that is missing', () => {
  try {
    readMailerConfig({ SMTP_HOST: 'smtp.example.cr' });
    assert.fail('the missing configuration was not reported');
  } catch (error) {
    assert.ok(error instanceof MailerConfigurationError);
    for (const name of ['SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']) {
      assert.match(error.message, new RegExp(name));
    }
  }
});

test('a variable present but blank counts as missing', () => {
  assert.throws(
    () => readMailerConfig({ ...CONFIGURED, SMTP_USER: '   ' }),
    MailerConfigurationError,
  );
});

test('the port becomes a number and the implicit TLS flag a boolean', () => {
  const config = readMailerConfig(CONFIGURED);

  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(readMailerConfig({ ...CONFIGURED, SMTP_SECURE: 'true' }).secure, true);
});

test('a business name cannot carry markup into the message', () => {
  const message = renderTemplate('applicationApproved', {
    businessName: '<script>alert(1)</script>',
    memberCode: 'MA7K2Q4',
  });

  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.html.includes('&lt;script&gt;'));
});

test('a rejection reason written by an administrator is escaped too', () => {
  const message = renderTemplate('applicationRejected', {
    businessName: 'Panadería',
    reason: '<img src=x onerror="steal()">',
  });

  assert.ok(!message.html.includes('<img'));
  assert.ok(message.html.includes('&lt;img'));
});

const TEMPLATE_FIXTURES = {
  applicationApproved: { businessName: 'A', memberCode: 'MA7K2Q4' },
  applicationRejected: { businessName: 'A', reason: 'No verificable.' },
  passwordResetLink: { resetUrl: 'https://cclu.example/password/reset/abc', minutesValid: 30 },
  administratorInvitation: {
    invitationUrl: 'https://cclu.example/admin/invitation/abc',
    daysValid: 7,
  },
  paymentSubmitted: { businessName: 'A' },
  paymentApproved: { businessName: 'A', paidUntil: '2026-10-21T12:00:00.000Z' },
  paymentRejected: { businessName: 'A', reason: 'El monto no coincide.' },
};

// Driven by the registry rather than a list written beside it, so a template
// added without anybody checking what it renders fails here.
test('every template answers with a subject and both bodies', () => {
  for (const name of TEMPLATE_NAMES) {
    const data = TEMPLATE_FIXTURES[name];

    assert.ok(data !== undefined, `no fixture for the ${name} template`);

    const message = renderTemplate(name, data);

    assert.equal(typeof message.subject, 'string');
    assert.ok(message.subject.length > 0);
    assert.ok(message.text.length > 0);
    assert.ok(message.html.length > 0);
  }
});

// The address is built by the API from a token it generated, but a template
// that dropped the escaping would still be the place it stopped being safe.
test('a reset link with no address to offer says so instead of writing undefined', () => {
  const message = renderTemplate('passwordResetLink', { minutesValid: 30 });

  assert.ok(!message.text.includes('undefined'));
  assert.ok(!message.html.includes('undefined'));
});

test('a template that does not exist is refused rather than sent empty', () => {
  assert.throws(() => renderTemplate('nothingLikeThis'), UnknownTemplateError);
});

test('a recipient that is not an address never reaches the transport', async () => {
  for (const recipient of [undefined, null, '', 'not-an-address', { $ne: null }, 42]) {
    const { sent, open } = transportThat(delivers);

    await assert.rejects(
      () =>
        sendEmail('applicationApproved', recipient, { businessName: 'A', memberCode: 'M1' }, open),
      EmailDeliveryError,
    );
    assert.equal(sent.length, 0);
  }
});

test('the message carries the configured sender and the rendered template', async () => {
  const { sent, open } = transportThat(delivers);

  await sendEmail(
    'applicationApproved',
    ' socio@example.cr ',
    { businessName: 'Panadería', memberCode: 'MA7K2Q4' },
    open,
  );

  assert.equal(sent[0].to, 'socio@example.cr');
  assert.equal(sent[0].from, CONFIGURED.MAIL_FROM);
  assert.match(sent[0].text, /MA7K2Q4/);
});

test('a send that fails is reported as a failure, never as a success', async () => {
  const { open } = transportThat(fails);

  await assert.rejects(
    () =>
      sendEmail(
        'applicationApproved',
        'socio@example.cr',
        { businessName: 'A', memberCode: 'M1' },
        open,
      ),
    EmailDeliveryError,
  );
});

test('notify never throws, so an operation is not undone by a notice that failed', async () => {
  const failing = async () => {
    throw new EmailDeliveryError('connection refused');
  };

  assert.equal(await notify('applicationApproved', 'socio@example.cr', {}, failing), false);
});

test('notify answers true only when the message actually left', async () => {
  const succeeding = async () => ({ messageId: 'abc' });

  assert.equal(await notify('applicationApproved', 'socio@example.cr', {}, succeeding), true);
});
