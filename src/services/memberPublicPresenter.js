const { createDownloadUrl } = require('./fileStorageService');
const { formatMemberCode } = require('./memberCodeService');

// The one shape a member's public data takes, whether reached through a card's
// code or found in a directory listing. Built rather than filtered: handing
// back the document and trusting a screen not to paint a field would still
// send it to the browser.
async function presentPublicMember(member, sign = createDownloadUrl) {
  return {
    memberCode: formatMemberCode(member.memberCode),
    businessName: member.businessName,
    businessDescription: member.businessDescription,
    memberType: member.memberType,
    sector: member.sector?.name ?? null,
    canton: member.canton?.name ?? null,
    province: member.canton?.province ?? null,
    location: member.location,
    phone: member.phone,
    whatsappNumber: member.whatsappNumber ?? null,
    instagram: member.instagram ?? null,
    facebook: member.facebook ?? null,
    linkedin: member.linkedin ?? null,
    website: member.website ?? null,
    logoUrl: member.logoKey ? await sign(member.logoKey) : (member.logoUrl ?? null),
    affiliatedSince: member.createdAt,
  };
}

module.exports = { presentPublicMember };
