import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AuthError, ConflictError, SiteStore } from '../src/services/site-store.js';

async function createStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'protectedtext-api-'));
  return {
    dir,
    store: new SiteStore(path.join(dir, 'sites.json'))
  };
}

const samplePayload = {
  ciphertext: 'cipher',
  iv: 'iv',
  salt: 'salt',
  algorithm: 'aes-256-gcm',
  kdf: 'argon2id',
  authToken: 'site-secret',
  noteHash: 'hash'
};

test('creates and fetches a site', async () => {
  const { store } = await createStore();
  const created = await store.putSite('demo-site', { ...samplePayload, expectedVersion: 0 });
  const fetched = await store.getSite('demo-site');

  assert.equal(created.version, 1);
  assert.equal(fetched.siteId, 'demo-site');
  assert.equal(fetched.ciphertext, 'cipher');
});

test('rejects updates with the wrong auth token', async () => {
  const { store } = await createStore();
  await store.putSite('demo-site', { ...samplePayload, expectedVersion: 0 });

  await assert.rejects(
    () =>
      store.putSite('demo-site', {
        ...samplePayload,
        authToken: 'wrong-secret',
        expectedVersion: 1
      }),
    AuthError
  );
});

test('rejects updates with a stale version', async () => {
  const { store } = await createStore();
  await store.putSite('demo-site', { ...samplePayload, expectedVersion: 0 });

  await assert.rejects(
    () =>
      store.putSite('demo-site', {
        ...samplePayload,
        ciphertext: 'updated',
        expectedVersion: 2
      }),
    ConflictError
  );
});

test('deletes a site with the correct auth token and version', async () => {
  const { store } = await createStore();
  await store.putSite('demo-site', { ...samplePayload, expectedVersion: 0 });

  const deleted = await store.deleteSite('demo-site', {
    authToken: 'site-secret',
    expectedVersion: 1
  });

  assert.equal(deleted, true);
  assert.equal(await store.getSite('demo-site'), null);
});
