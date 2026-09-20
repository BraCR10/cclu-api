const test = require('node:test');
const assert = require('node:assert/strict');
const { sendEmail, notify, EmailDeliveryError } = require('../../src/services/emailService');
const { renderTemplate, UnknownTemplateError } = require('../../src/emails');
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

test('every template answers with a subject and both bodies', () => {
  const rendered = [
    renderTemplate('applicationApproved', { businessName: 'A', memberCode: 'MA7K2Q4' }),
    renderTemplate('applicationRejected', { businessName: 'A', reason: 'No verificable.' }),
    renderTemplate('passwordChangeCode', { code: '123456', minutesValid: 15 }),
  ];

  for (const message of rendered) {
    assert.equal(typeof message.subject, 'string');
    assert.ok(message.subject.length > 0);
    assert.ok(message.text.length > 0);
    assert.ok(message.html.length > 0);
  }
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
