// The one source of the current time for decisions about access. The server's
// clock, never a date a person sent. Read through here so a test can name the
// moment it is checking.
function now() {
  return new Date();
}

module.exports = { now };
