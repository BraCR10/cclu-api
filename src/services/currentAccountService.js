const { Member } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { ROLES } = require('../config/roles');
const { effectiveMemberState } = require('./memberStatusService');

// What a signed in person may be shown about themselves. The session carries
// only an identifier and a role, which is not enough to greet anyone by name.
const SOURCES = {
  [ROLES.MEMBER]: async (id) => {
    const member = await Member.findById(id)
      .select('email businessName memberCode applicationStatus accountStatus')
      .lean();

    if (member === null) {
      return null;
    }

    return {
      email: member.email,
      displayName: member.businessName,
      memberCode: member.memberCode ?? null,
      state: effectiveMemberState(member),
    };
  },

  [ROLES.ADMIN]: async (id) => {
    const admin = await Admin.findById(id).select('email').lean();

    if (admin === null) {
      return null;
    }

    return { email: admin.email, displayName: admin.email };
  },
};

async function describeCurrentAccount(identity, sources = SOURCES) {
  const describe = sources[identity?.role];

  if (describe === undefined) {
    return null;
  }

  const details = await describe(identity.id);

  return details === null ? null : { id: identity.id, role: identity.role, ...details };
}

module.exports = { describeCurrentAccount };
