/**
 * @module site-id
 * Normalizes and validates `siteId` values so the API always uses a consistent
 * lowercase-slug format regardless of what the caller sends.
 *
 * Valid siteId: lowercase letters, digits, and hyphens, no leading/trailing
 * hyphens, max 120 characters. Example: `"my-notes-2024"`.
 *
 * Normalization: `"My Notes!"` → `"my-notes"`.
 */

/** Regex that a normalized siteId must fully match. */
const SITE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Converts any string into a normalized siteId slug:
 * - Trims whitespace
 * - Lowercases
 * - Replaces runs of non-alphanumeric characters with a single hyphen
 * - Strips leading/trailing hyphens
 * - Truncates to 120 characters
 *
 * Does **not** throw — always returns a string (may be empty for invalid input).
 *
 * @param {unknown} input - Raw siteId value from the caller.
 * @returns {string} Normalized siteId slug.
 */
export function normalizeSiteId(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Normalizes and validates a siteId, throwing if the result is not a valid slug.
 *
 * @param {unknown} input - Raw siteId value from the request URL.
 * @returns {string} The normalized, valid siteId.
 * @throws {Error} `'INVALID_SITE_ID'` if the normalized value fails validation.
 */
export function assertValidSiteId(input) {
  const siteId = normalizeSiteId(input);

  if (!siteId || !SITE_ID_PATTERN.test(siteId)) {
    throw new Error('INVALID_SITE_ID');
  }

  return siteId;
}

