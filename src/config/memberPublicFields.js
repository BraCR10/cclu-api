// What a directory, a public profile or a listing may ever read from a member.
// Named field by field rather than by removing what must not leave, because a
// field added to the model later would otherwise arrive here on its own. The
// address is left out on purpose: it is what someone signs in with, and a
// directory needs the telephone and the site, not the credential.
const PUBLIC_FIELDS = [
  'businessName',
  'businessDescription',
  'memberType',
  'memberCode',
  'location',
  'phone',
  'whatsappNumber',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'logoUrl',
  'logoKey',
  'createdAt',
  'applicationStatus',
  'accountStatus',
].join(' ');

module.exports = { PUBLIC_FIELDS };
