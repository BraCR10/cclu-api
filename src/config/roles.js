const ROLES = {
  MEMBER: 'member',
  ADMIN: 'admin',
};

// A public visitor holds no role. Public access is expressed by leaving the
// authentication middleware off a route, not by a role nobody is ever issued.

module.exports = { ROLES };
