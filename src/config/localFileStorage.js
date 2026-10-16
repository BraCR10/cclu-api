const fs = require('node:fs/promises');
const path = require('node:path');

// Where files live when no bucket is configured. A development machine and the
// chamber's own machine have no object store, and a registration that carries an
// upload has to work on both.
const LOCAL_DIRECTORY_VARIABLE = 'FILE_STORAGE_DIRECTORY';
const DEFAULT_LOCAL_DIRECTORY = '.file-storage';

// The address the API answers on, so a stored file can be handed out as an
// address of its own. A deployment sets it to the public one.
const PUBLIC_ADDRESS_VARIABLE = 'API_PUBLIC_URL';
const DEFAULT_PUBLIC_ADDRESS = 'http://localhost:4000';

function readLocalDirectory(environment = process.env) {
  return environment[LOCAL_DIRECTORY_VARIABLE] || DEFAULT_LOCAL_DIRECTORY;
}

function readPublicAddress(environment = process.env) {
  return (environment[PUBLIC_ADDRESS_VARIABLE] || DEFAULT_PUBLIC_ADDRESS).replace(/\/+$/, '');
}

// The key is written by the file service and checked there before it arrives
// here. A driver is still the last place a key could climb out of the directory
// the chamber chose, so the resolved path is checked rather than trusted.
function resolveWithin(directory, key) {
  const root = path.resolve(directory);
  const target = path.resolve(root, ...key.split('/'));

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('The file key leaves the directory this storage is confined to.');
  }

  return target;
}

function createLocalStore(directory = readLocalDirectory()) {
  return {
    async putObject({ key, content }) {
      const target = resolveWithin(directory, key);

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    },

    // Nothing on a disk to sign. The address handed out is the API's own, and
    // the key inside it is the whole capability: 256 random bits, unguessable,
    // and the same thing a signed address is on a bucket. The key travels
    // encoded because a path keeps its slashes as separators.
    createSignedDownloadUrl({ key }) {
      return Promise.resolve(`${readPublicAddress()}/api/files/${encodeURIComponent(key)}`);
    },

    async readObject({ key }) {
      return fs.readFile(resolveWithin(directory, key));
    },

    async deleteObject({ key }) {
      await fs.rm(resolveWithin(directory, key), { force: true });
    },
  };
}

module.exports = {
  LOCAL_DIRECTORY_VARIABLE,
  PUBLIC_ADDRESS_VARIABLE,
  createLocalStore,
  readLocalDirectory,
  readPublicAddress,
};
