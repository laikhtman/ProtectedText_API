# API reference

## Base routes

- `GET /health`
- `GET /api/v1/sites/:siteId`
- `PUT /api/v1/sites/:siteId`
- `DELETE /api/v1/sites/:siteId`

## `GET /health`

Returns a simple health payload.

### Response

```json
{
  "status": "ok"
}
```

## `GET /api/v1/sites/:siteId`

Fetches an encrypted site payload.

### Success response

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

### Error responses

- `400` invalid `siteId`
- `404` site not found
- `429` rate limit exceeded

## `PUT /api/v1/sites/:siteId`

Creates or updates a site.

### Request body

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

### Rules

- `expectedVersion: 0` creates a new site.
- `expectedVersion: <current version>` updates an existing site.
- The request fails if the client sends a stale version.
- The request fails if the token does not match the stored token hash.

### Error responses

- `400` invalid input
- `401` invalid auth token
- `409` version conflict
- `429` rate limit exceeded

## `DELETE /api/v1/sites/:siteId`

Deletes a site.

### Request body

```json
{
  "authToken": "client-derived-secret",
  "expectedVersion": 1
}
```

### Error responses

- `400` invalid input
- `401` invalid auth token
- `404` site not found
- `409` version conflict
- `429` rate limit exceeded

