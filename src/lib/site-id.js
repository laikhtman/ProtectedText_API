const SITE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSiteId(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function assertValidSiteId(input) {
  const siteId = normalizeSiteId(input);

  if (!siteId || !SITE_ID_PATTERN.test(siteId)) {
    throw new Error('INVALID_SITE_ID');
  }

  return siteId;
}

