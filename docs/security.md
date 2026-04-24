# Security model

## Goal

The project aims to keep the server blind to note plaintext.

## Current model

- note content is expected to arrive already encrypted,
- the server stores ciphertext and encryption metadata,
- the server does not need the raw password,
- the server stores only a salted hash of a client-derived `authToken`,
- clients must manage encryption, decryption, and secret derivation locally.

## Important limitation

This implementation is trust-minimized, but it is not an exact reproduction of ProtectedText's original browser-only verification approach.

The current API uses a reusable client-derived authorization token for writes and deletes. That is practical for a public API, but it is still a design choice that should be reviewed before production release.

## Current protections

- hashed auth token verification
- optimistic concurrency to prevent silent overwrites
- IP-based request throttling
- no plaintext storage in the current server design

## Production hardening recommendations

1. Serve the API only over TLS.
2. Put the service behind a reverse proxy with request size and rate controls.
3. Replace the JSON file store with a durable database.
4. Add structured logging that avoids sensitive payload data.
5. Define a formal client-side crypto scheme and publish it with test vectors.
