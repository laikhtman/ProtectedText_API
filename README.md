# ProtectedText API

An independent, open-source API for site-based encrypted notes inspired by [ProtectedText](https://www.protectedtext.com/).

Detailed project documentation lives in [`docs/`](docs/README.md).

## What this project is

- A clean-room implementation scaffold for a public API.
- Notes are addressed by `siteId`, not by user accounts.
- The server stores encrypted payloads and metadata only.
- Clients are expected to encrypt and decrypt note contents locally.
- Updates use optimistic concurrency to prevent silent overwrites.

## Export tool

`export_site.py` exports a live [protectedtext.com](https://www.protectedtext.com/) site to local `.txt` files — one file per tab, named after the tab title.

```bash
python export_site.py <siteId>
```

A folder named after the site ID is created in your current working directory. Each tab becomes a `.txt` file inside it.

**Requirements:** Python 3.10+. Dependencies (`argon2-cffi`, `pycryptodome`) are installed automatically on first run.

## Current trust model

This first version keeps plaintext off the server, but it uses a **client-derived authorization token** for write/delete operations. That means:

- the server does **not** receive plaintext note contents,
- the server does **not** need the raw user password,
- the client must derive an `authToken` from the password and `siteId`,
- the server stores only a salted hash of that token.

This is a practical public API starting point, but it is not a perfect reproduction of ProtectedText's browser-only verification model.

## API

### Health

`GET /health`

### Fetch a site

`GET /api/v1/sites/:siteId`

Response:

```json
{
  "siteId": "my-note",
  "version": 1,
  "createdAt": "2026-04-24T08:00:00.000Z",
  "updatedAt": "2026-04-24T08:00:00.000Z",
  "ciphertext": "base64...",
  "iv": "base64...",
  "salt": "base64...",
  "algorithm": "aes-256-gcm",
  "kdf": "argon2id",
  "noteHash": "sha256..."
}
```

### Create or update a site

`PUT /api/v1/sites/:siteId`

Request:

```json
{
  "ciphertext": "base64...",
  "iv": "base64...",
  "salt": "base64...",
  "algorithm": "aes-256-gcm",
  "kdf": "argon2id",
  "authToken": "client-derived-secret",
  "expectedVersion": 0,
  "noteHash": "sha256..."
}
```

Rules:

- Use `expectedVersion: 0` to create a new site.
- Use the current version to update an existing site.
- A mismatched version returns `409 Conflict`.

### Delete a site

`DELETE /api/v1/sites/:siteId`

Request:

```json
{
  "authToken": "client-derived-secret",
  "expectedVersion": 1
}
```

## Local development

### Start

```bash
npm start
```

Environment variables:

- `HOST` default `127.0.0.1`
- `PORT` default `3000`
- `DATA_FILE` default `data/sites.json`
- `RATE_LIMIT_WINDOW_MS` default `60000`
- `RATE_LIMIT_MAX_REQUESTS` default `60`

### Test

```bash
npm test
```

## Security and release notes

- A simple in-memory IP rate limiter is enabled by default for public-facing safety.
- The current JSON file store is suitable for local development and small demos, not production.
- If you publish this, front it with TLS, reverse-proxy request limits, and a durable database.
- For a real trustless client, the browser/mobile app should derive both the encryption key and `authToken` locally.

## Recommended next steps

1. Add a real client crypto package and reference browser/mobile clients.
2. Replace the JSON file store with SQLite or PostgreSQL.
3. Publish an OpenAPI spec and deployment examples.



