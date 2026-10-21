const branchService = require('../services/branchService');

const { readOwnBranches, createBranch, updateBranch, deleteBranch } = branchService;

async function getOwnBranches(request, response, next, read = readOwnBranches) {
  response.json(await read(request.identity.id));
}

async function createOwnBranch(request, response, next, create = createBranch) {
  response.status(201).json(await create(request.identity.id, request.body));
}

// The branch id travels in the path and the member in the session, and the
// service matches the two: naming somebody else's branch finds nothing.
async function updateOwnBranch(request, response, next, update = updateBranch) {
  response.json(await update(request.identity.id, request.params.branchId, request.body));
}

async function deleteOwnBranch(request, response, next, remove = deleteBranch) {
  response.json(await remove(request.identity.id, request.params.branchId));
}

module.exports = { getOwnBranches, createOwnBranch, updateOwnBranch, deleteOwnBranch };
