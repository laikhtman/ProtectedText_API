/**
 * @module auth
 * Hashes and verifies client-derived authorization tokens using Node's built-in
 * `crypto.scrypt` KDF so the server never stores a raw token.
 *
 * Flow:
 *   1. Client derives an `authToken` from its password + siteId (client-side).
 *   2. On first write the server calls `hashAuthToken` and persists `{ salt, hash }`.
 *   3. On subsequent writes the server calls `verifyAuthToken` with the supplied
 *      token against the stored `{ salt, hash }`.
 *
 * All comparisons use `crypto.timingSafeEqual` to prevent timing-oracle attacks.
 */

import crypto from 'node:crypto';

/** Number of bytes produced by scrypt — 64 bytes = 512-bit key. */
const KEY_LENGTH = 64;

/**
 * Promise-based wrapper around `crypto.scrypt`.
 *
 * @param {string} secret - The value to derive a key from (the raw authToken).
 * @param {string} salt   - A hex-encoded random salt string.
 * @returns {Promise<Buffer>} The derived key as a Buffer.
 */
function scryptAsync(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

/**
 * Hashes an auth token for storage.
 * Generates a fresh 16-byte random salt each time so identical tokens produce
 * different stored values.
 *
 * @param {string} authToken - The client-derived authorization token.
 * @returns {Promise<{ salt: string, hash: string }>} Hex-encoded salt and hash.
 */
export async function hashAuthToken(authToken) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(authToken, salt);
  return {
    salt,
    hash: Buffer.from(derivedKey).toString('hex')
  };
}

/**
 * Verifies an auth token against a previously stored `{ salt, hash }` pair.
 * Uses `timingSafeEqual` to prevent timing-based side-channel attacks.
 *
 * @param {string} authToken                        - Token supplied by the client.
 * @param {{ salt: string, hash: string }|undefined} auth - Stored credentials.
 * @returns {Promise<boolean>} `true` if the token matches, `false` otherwise.
 */
export async function verifyAuthToken(authToken, auth) {
  if (!auth?.salt || !auth?.hash) {
    return false;
  }

  const candidate = await scryptAsync(authToken, auth.salt);
  const stored = Buffer.from(auth.hash, 'hex');

  if (candidate.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, stored);
}

