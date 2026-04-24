/**
 * @module site-store
 * Persistent store for encrypted note sites.
 *
 * Data is serialised as a JSON file on disk. All write operations are serialised
 * through a single Promise chain (`#writeChain`) so concurrent requests never
 * produce interleaved writes or corrupt the file.
 *
 * The `auth` field (salt + scrypt hash) is stripped from every value returned to
 * callers — it is intentionally kept server-side only.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { hashAuthToken, verifyAuthToken } from '../lib/auth.js';

/**
 * Returns a copy of `site` with the `auth` field removed, safe to send to clients.
 *
 * @param {{ auth: unknown, [key: string]: unknown }} site
 * @returns {Record<string, unknown>}
 */
function serializeSite(site) {
  const { auth, ...publicSite } = site;
  return publicSite;
}

/** Thrown when a write or delete would violate optimistic-concurrency rules. */
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Thrown when the supplied `authToken` does not match the stored credential. */
export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

export class SiteStore {
  /** @type {string} Absolute path to the JSON data file. */
  #dataFile;

  /**
   * In-memory site map, keyed by normalised siteId.
   * @type {Map<string, Record<string, unknown>>}
   */
  #sites = new Map();

  /** Whether the data file has been loaded into `#sites` yet. */
  #loaded = false;

  /**
   * Serialised write queue. All mutations are appended as `.then()` callbacks so
   * they execute one at a time, preventing concurrent file writes.
   * @type {Promise<unknown>}
   */
  #writeChain = Promise.resolve();

  /**
   * @param {string} dataFile - Path to the JSON persistence file.
   */
  constructor(dataFile) {
    this.#dataFile = dataFile;
  }

  /**
   * Lazy-loads data from disk on the first call.
   * Creates the parent directory if it does not yet exist.
   * A missing file is treated as an empty store (not an error).
   */
  async #ensureLoaded() {
    if (this.#loaded) {
      return;
    }

    await fs.mkdir(path.dirname(this.#dataFile), { recursive: true });

    try {
      const raw = await fs.readFile(this.#dataFile, 'utf8');
      const parsed = JSON.parse(raw);

      for (const site of parsed.sites ?? []) {
        this.#sites.set(site.siteId, site);
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }
    }

    this.#loaded = true;
  }

  /**
   * Writes the current in-memory state back to disk as formatted JSON.
   */
  async #persist() {
    const payload = {
      sites: [...this.#sites.values()]
    };

    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(this.#dataFile, serialized, 'utf8');
  }

  /**
   * Appends `operation` to the write chain so it runs after all currently
   * enqueued writes complete. Both resolve and reject paths advance the chain
   * so a single failure does not permanently stall subsequent operations.
   *
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  async #withWriteLock(operation) {
    this.#writeChain = this.#writeChain.then(operation, operation);
    return this.#writeChain;
  }

  /**
   * Retrieves a site by ID, stripping the `auth` field before returning.
   *
   * @param {string} siteId - Normalised siteId.
   * @returns {Promise<Record<string, unknown>|null>} Public site object, or `null` if not found.
   */
  async getSite(siteId) {
    await this.#ensureLoaded();
    const site = this.#sites.get(siteId);
    return site ? serializeSite(site) : null;
  }

  /**
   * Creates a new site or updates an existing one.
   *
   * Create rules:
   * - `expectedVersion` must be `0`; if the site already exists a ConflictError is thrown.
   * - A fresh scrypt hash of `authToken` is stored for future verification.
   *
   * Update rules:
   * - `authToken` must match the stored credential (AuthError on mismatch).
   * - `expectedVersion` must equal the current version (ConflictError on mismatch).
   * - The stored `version` is incremented by 1.
   *
   * @param {string} siteId
   * @param {{ ciphertext: string, iv: string, salt: string, algorithm: string,
   *           kdf: string, authToken: string, expectedVersion?: number,
   *           noteHash?: string }} input
   * @returns {Promise<Record<string, unknown>>} The saved site (without `auth`).
   * @throws {ConflictError|AuthError}
   */
  async putSite(siteId, input) {
    await this.#ensureLoaded();

    return this.#withWriteLock(async () => {
      const existing = this.#sites.get(siteId);
      const now = new Date().toISOString();
      const expectedVersion = Number(input.expectedVersion ?? 0);

      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        throw new ConflictError('expectedVersion must be a non-negative integer.');
      }

      if (!existing) {
        if (expectedVersion !== 0) {
          throw new ConflictError('Site does not exist. Use expectedVersion 0 to create it.');
        }

        const auth = await hashAuthToken(input.authToken);
        const created = {
          siteId,
          version: 1,
          createdAt: now,
          updatedAt: now,
          ciphertext: input.ciphertext,
          iv: input.iv,
          salt: input.salt,
          algorithm: input.algorithm,
          kdf: input.kdf,
          noteHash: input.noteHash ?? null,
          auth
        };

        this.#sites.set(siteId, created);
        await this.#persist();
        return serializeSite(created);
      }

      const isAuthorized = await verifyAuthToken(input.authToken, existing.auth);

      if (!isAuthorized) {
        throw new AuthError('Invalid auth token.');
      }

      if (expectedVersion !== existing.version) {
        throw new ConflictError(`Version mismatch. Current version is ${existing.version}.`);
      }

      const updated = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        ciphertext: input.ciphertext,
        iv: input.iv,
        salt: input.salt,
        algorithm: input.algorithm,
        kdf: input.kdf,
        noteHash: input.noteHash ?? null
      };

      this.#sites.set(siteId, updated);
      await this.#persist();
      return serializeSite(updated);
    });
  }

  /**
   * Deletes a site. Both `authToken` and `expectedVersion` must be correct.
   *
   * @param {string} siteId
   * @param {{ authToken: string, expectedVersion?: number }} input
   * @returns {Promise<boolean>} `true` if deleted, `false` if the site did not exist.
   * @throws {ConflictError|AuthError}
   */
  async deleteSite(siteId, input) {
    await this.#ensureLoaded();

    return this.#withWriteLock(async () => {
      const existing = this.#sites.get(siteId);

      if (!existing) {
        return false;
      }

      const expectedVersion = Number(input.expectedVersion ?? -1);

      if (expectedVersion !== existing.version) {
        throw new ConflictError(`Version mismatch. Current version is ${existing.version}.`);
      }

      const isAuthorized = await verifyAuthToken(input.authToken, existing.auth);

      if (!isAuthorized) {
        throw new AuthError('Invalid auth token.');
      }

      this.#sites.delete(siteId);
      await this.#persist();
      return true;
    });
  }
}

