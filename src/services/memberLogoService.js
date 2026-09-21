const { Member } = require('../models/Member');
const { FILE_PURPOSES } = require('../config/fileStorage');
const { createDownloadUrl, deleteFile } = require('./fileStorageService');
const { uploadImage } = require('./imageUploadService');
const { ValidationError, CODES } = require('../config/memberRules');

function findLogoKey(memberId) {
  return Member.findById(memberId).select('logoKey').lean();
}

// The new key replaces logoUrl rather than sitting beside it, so a member's
// logo has one source of truth whichever way it was last set.
function saveLogoKey(memberId, logoKey) {
  return Member.findByIdAndUpdate(
    memberId,
    { $set: { logoKey }, $unset: { logoUrl: '' } },
    { returnDocument: 'after' },
  )
    .select('logoKey')
    .lean();
}

function clearLogoKey(memberId) {
  return Member.findByIdAndUpdate(memberId, { $unset: { logoKey: '' } });
}

function accountGone() {
  return new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
}

async function uploadLogo(
  memberId,
  body,
  find = findLogoKey,
  upload = uploadImage,
  save = saveLogoKey,
  remove = deleteFile,
  sign = createDownloadUrl,
) {
  const existing = await find(memberId);

  if (existing === null || existing === undefined) {
    throw accountGone();
  }

  const { key } = await upload({
    purpose: FILE_PURPOSES.MEMBER_LOGO,
    ownerId: memberId,
    contentType: body?.contentType,
    base64: body?.content,
  });

  await save(memberId, key);

  // Removed only once the new logo is safely in place, so a failed upload
  // never leaves a member with no logo at all.
  if (existing.logoKey) {
    await remove(existing.logoKey);
  }

  return { logoUrl: await sign(key) };
}

async function deleteLogo(memberId, find = findLogoKey, remove = deleteFile, clear = clearLogoKey) {
  const existing = await find(memberId);

  if (existing === null || existing === undefined) {
    throw accountGone();
  }

  if (existing.logoKey) {
    await remove(existing.logoKey);
    await clear(memberId);
  }
}

module.exports = { uploadLogo, deleteLogo };
