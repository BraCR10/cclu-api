// Every account in the system answers the same question the same way: does it
// work right now. Agremiado and Administrador share these values so that
// suspending an account means one thing wherever it is read.
const ACCOUNT_STATUSES = {
  ACTIVA: 'activa',
  SUSPENDIDA: 'suspendida',
};

module.exports = { ACCOUNT_STATUSES };
