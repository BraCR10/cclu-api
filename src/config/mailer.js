const REQUIRED_VARIABLES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];

class MailerConfigurationError extends Error {
  constructor(missing) {
    super(`Email is not configured. Set ${missing.join(', ')} before sending.`);
    this.name = 'MailerConfigurationError';
    this.statusCode = 500;
  }
}

// Read at send time rather than at import time, so a process that never sends
// an email is not forced to carry the configuration.
function readMailerConfig(environment = process.env) {
  const missing = REQUIRED_VARIABLES.filter((name) => {
    const value = environment[name];

    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new MailerConfigurationError(missing);
  }

  return {
    host: environment.SMTP_HOST,
    port: Number(environment.SMTP_PORT),
    // Port 465 speaks TLS from the first byte; everything else upgrades with
    // STARTTLS after connecting.
    secure: environment.SMTP_SECURE === 'true',
    auth: {
      user: environment.SMTP_USER,
      pass: environment.SMTP_PASSWORD,
    },
    from: environment.MAIL_FROM,
  };
}

module.exports = { readMailerConfig, MailerConfigurationError, REQUIRED_VARIABLES };
