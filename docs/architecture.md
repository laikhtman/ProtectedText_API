# Architecture

## High-level flow

1. A client chooses a `siteId`.
2. The client encrypts note content locally.
3. The client derives an `authToken` locally from its secret.
4. The client sends only encrypted note data, metadata, and the derived token to the API.
5. The API stores the encrypted payload and a salted hash of the token.
6. Updates and deletes require the same derived token and the expected version.

## Main modules

### `src/server.js`

Defines the HTTP server and routes:

- `GET /health`
- `GET /api/v1/sites/:siteId`
- `PUT /api/v1/sites/:siteId`
- `DELETE /api/v1/sites/:siteId`

It also applies request validation, error mapping, and IP-based rate limiting.

### `src/services/site-store.js`

Implements persistence and business rules:

- lazy loading from disk
- create and update semantics
- optimistic concurrency
- auth token verification
- delete behavior

### `src/lib/auth.js`

Hashes and verifies client-derived authorization tokens using Node's built-in crypto primitives.

### `src/lib/site-id.js`

Normalizes and validates incoming `siteId` values so the API uses a consistent identifier format.

### `src/lib/rate-limit.js`

Provides a simple in-memory limiter keyed by client IP address.

## Persistence model

The current store writes a JSON file shaped like this:

```json
{
  "sites": [
    {
      "siteId": "demo-site",
      "version": 1,
      "createdAt": "2026-04-24T08:00:00.000Z",
      "updatedAt": "2026-04-24T08:00:00.000Z",
      "ciphertext": "base64...",
      "iv": "base64...",
      "salt": "base64...",
      "algorithm": "aes-256-gcm",
      "kdf": "argon2id",
      "noteHash": "sha256...",
      "auth": {
        "salt": "hex...",
        "hash": "hex..."
      }
    }
  ]
}
```

The API removes the `auth` object before returning site data to clients.

