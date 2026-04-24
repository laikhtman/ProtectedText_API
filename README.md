<div align="center">

# 🔐 ProtectedText API

**A zero-dependency, self-hosted REST API for encrypted notes —  
plus a tool to rescue your data from [protectedtext.com](https://www.protectedtext.com/).**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![Python ≥3.10](https://img.shields.io/badge/Python-%E2%89%A53.10-blue?logo=python&logoColor=white)](https://python.org)
[![Tests](https://img.shields.io/badge/tests-5%20passing-brightgreen?logo=github)](#testing)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![zero deps](https://img.shields.io/badge/dependencies-zero-blueviolet)](#quick-start)

[Features](#-features) · [Quick Start](#-quick-start) · [Export Tool](#-export-your-data) · [API](#-api-reference) · [Docs](docs/README.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## 🤔 Why this exists

ProtectedText is brilliant — encrypted notes, no account, just a URL and password.  
This project gives you **the same idea on your own server**, and a **CLI tool** to export everything you already have on protectedtext.com to plain files.

> **The server never sees your plaintext. Ever.**

---

## ✨ Features

| | |
|---|---|
| 🔒 **Zero plaintext storage** | Ciphertext, IV, and salt only — the key never leaves the client |
| 📦 **Zero npm dependencies** | Pure Node.js 20 built-ins, nothing to `npm install` |
| 🔑 **Scrypt-hashed auth tokens** | Client-derived tokens; the server stores only a salted hash |
| ⚡ **Optimistic concurrency** | Version-gated writes prevent silent overwrites |
| 🛡️ **IP rate limiting** | In-memory sliding window, configurable per deployment |
| 📤 **protectedtext.com exporter** | Reverse-engineered Argon2id + AES decryption for all site types |
| 🧪 **Fully tested** | 5 automated tests, pure Node.js built-in test runner |

---

## 🚀 Quick Start

> **Requirements:** Node.js ≥ 20 — no other dependencies.

```bash
git clone https://github.com/laikhtman/ProtectedText_API.git
cd ProtectedText_API
npm start
```

```
✅  Listening on http://127.0.0.1:3000
```

That's it. No `npm install`. No Docker required.

### Testing

```bash
npm test
```

```
✔ creates a new site
✔ rejects wrong auth token
✔ rejects version mismatch
✔ rate limiter blocks over-limit requests
✔ rate limiter resets after window
▶ 5 tests passed (373ms)
```

---

## 📤 Export your data

Pull every tab from any [protectedtext.com](https://www.protectedtext.com/) site and save each one as a `.txt` file — **one command, no browser needed.**

> **Requirements:** Python ≥ 3.10. Dependencies are installed automatically on first run.

```bash
python export_site.py mysite
```

```
Site ID: mysite
Password: ••••••••

🔓 Decrypting...  ✔  33 tabs decrypted (legacy AES)

📁 Saved to mysite/
   ├── Shopping list.txt
   ├── Project ideas.txt
   ├── Work notes.txt
   └── ... 30 more
```

A folder named after the site ID is created in your working directory.  
Each tab becomes a `.txt` file named after the tab's first line (the title).

> ✅ Supports both **legacy** (AES + plain password) and **modern** (Argon2id-chain, up to 10 iterations) protectedtext.com encryption.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/v1/sites/:siteId` | Fetch an encrypted note |
| `PUT` | `/api/v1/sites/:siteId` | Create or update an encrypted note |
| `DELETE` | `/api/v1/sites/:siteId` | Delete a note |

<details>
<summary><b>GET /api/v1/sites/:siteId</b></summary>

```http
GET /api/v1/sites/my-note
```

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

</details>

<details>
<summary><b>PUT /api/v1/sites/:siteId — create or update</b></summary>

```http
PUT /api/v1/sites/my-note
Content-Type: application/json
```

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

- `expectedVersion: 0` → create a new site  
- `expectedVersion: N` → update; returns `409 Conflict` on mismatch

</details>

<details>
<summary><b>DELETE /api/v1/sites/:siteId</b></summary>

```http
DELETE /api/v1/sites/my-note
Content-Type: application/json
```

```json
{
  "authToken": "client-derived-secret",
  "expectedVersion": 1
}
```

</details>

---

## ⚙️ Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | Port |
| `DATA_FILE` | `data/sites.json` | Persistent storage path |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `60` | Max requests per window per IP |

```bash
PORT=8080 DATA_FILE=/var/data/sites.json npm start
```

---

## 🔒 Security model

- **Client-side encryption only** — the server derives nothing from the password
- **Auth tokens** — clients derive a token from their secret; server stores only a `scrypt` hash
- **No accounts** — notes are addressed by `siteId`, not user identity
- **Timing-safe equality** — auth comparison uses `crypto.timingSafeEqual`
- **Optimistic concurrency** — version field prevents blind overwrites

See [docs/security.md](docs/security.md) for a full breakdown and production hardening checklist.

---

## 🗺️ Roadmap

- [ ] OpenAPI 3 spec + Swagger UI  
- [ ] SQLite / PostgreSQL storage adapter  
- [ ] Docker + docker-compose  
- [ ] Browser client reference implementation  
- [ ] Distributed rate limiting (Redis)  
- [ ] Structured logging  

Have an idea? [Open an issue](https://github.com/laikhtman/ProtectedText_API/issues/new) or submit a PR!

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

1. Fork the repo
2. Create a feature branch — `git checkout -b feature/amazing-feature`
3. Commit your changes
4. Push to your fork and [open a PR](https://github.com/laikhtman/ProtectedText_API/pulls)

---

## 📄 License

MIT © [laikhtman](https://github.com/laikhtman) — see [LICENSE](LICENSE) for details.

---

<div align="center">

If this project helped you, please consider giving it a ⭐ — it helps others find it!

</div>
