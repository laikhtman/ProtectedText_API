# App overview

## Purpose

This project is an independent API for encrypted, site-based notes inspired by ProtectedText.

The main idea is:

- notes are identified by a `siteId`,
- clients encrypt and decrypt note data locally,
- the server stores encrypted payloads and metadata only,
- updates are protected with optimistic concurrency so users do not silently overwrite each other.

## Current scope

The current implementation is a lightweight public scaffold intended for:

- local development,
- open-source publication,
- early client integration work,
- experimentation with a trust-minimized note storage model.

## What the app currently includes

- HTTP API built on Node.js core modules
- file-backed persistence in `data/sites.json`
- create, fetch, update, and delete operations for encrypted notes
- hashed client-derived auth tokens for write and delete authorization
- basic in-memory IP rate limiting
- automated tests for the store and rate-limiting logic
- `export_site.py` — a Python script that downloads and decrypts a live protectedtext.com site and exports each tab as a local `.txt` file

## What the app does not yet include

- production-grade database storage
- real browser or mobile client crypto integration
- OpenAPI specification
- reverse-proxy deployment configuration
- persistent distributed rate limiting

