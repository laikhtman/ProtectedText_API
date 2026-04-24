# Development guide

## Requirements

- Node.js 20 or newer (API server)
- Python 3.10 or newer (export tool)

## Install

The API server uses only Node.js built-ins — no `npm install` needed.

The export tool (`export_site.py`) auto-installs its Python dependencies (`argon2-cffi`, `pycryptodome`) on first run.

## Run locally

```bash
npm start
```

By default the API listens on `127.0.0.1:3000`.

## Run tests

```bash
npm test
```

## Export a protectedtext.com site

```bash
python export_site.py <siteId>
```

You will be prompted for the site password. A folder named `<siteId>` is created in the current directory, containing one `.txt` file per tab.

## Environment variables

- `HOST` default `127.0.0.1`
- `PORT` default `3000`
- `DATA_FILE` default `data/sites.json`
- `RATE_LIMIT_WINDOW_MS` default `60000`
- `RATE_LIMIT_MAX_REQUESTS` default `60`

## Suggested next development steps

1. Add a real frontend or mobile client that performs encryption locally.
2. Replace file-backed persistence with a real database.
3. Add OpenAPI generation and deployment examples.
4. Move rate limiting to infrastructure or shared storage for multi-instance deployments.

