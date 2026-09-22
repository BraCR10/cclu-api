// The chamber's own say over a publication, separate from what its owner does
// with isActive. Blocked is permanent: not even the owner can bring it back.
const ADMIN_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
};

module.exports = { ADMIN_STATUSES };
