import fs from 'node:fs/promises';
import path from 'node:path';

import { hashAuthToken, verifyAuthToken } from '../lib/auth.js';

function serializeSite(site) {
  const { auth, ...publicSite } = site;
  return publicSite;
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

export class SiteStore {
  #dataFile;
  #sites = new Map();
  #loaded = false;
  #writeChain = Promise.resolve();

  constructor(dataFile) {
    this.#dataFile = dataFile;
  }

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

  async #persist() {
    const payload = {
      sites: [...this.#sites.values()]
    };

    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(this.#dataFile, serialized, 'utf8');
  }

  async #withWriteLock(operation) {
    this.#writeChain = this.#writeChain.then(operation, operation);
    return this.#writeChain;
  }

  async getSite(siteId) {
    await this.#ensureLoaded();
    const site = this.#sites.get(siteId);
    return site ? serializeSite(site) : null;
  }

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

