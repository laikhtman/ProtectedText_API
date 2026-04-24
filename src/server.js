import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { readJsonBody, sendJson, sendNoContent } from './lib/http.js';
import { RateLimiter } from './lib/rate-limit.js';
import { assertValidSiteId } from './lib/site-id.js';
import { AuthError, ConflictError, SiteStore } from './services/site-store.js';

function validateUpsertBody(body) {
  const requiredFields = ['ciphertext', 'iv', 'salt', 'algorithm', 'kdf', 'authToken'];

  for (const field of requiredFields) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      throw new Error(`Field "${field}" must be a non-empty string.`);
    }
  }
}

function validateDeleteBody(body) {
  if (typeof body.authToken !== 'string' || body.authToken.trim() === '') {
    throw new Error('Field "authToken" must be a non-empty string.');
  }
}

export function createServer(options = {}) {
  const store = options.store ?? new SiteStore(config.dataFile);
  const rateLimiter =
    options.rateLimiter ??
    new RateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests
    });

  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      const forwardedFor = request.headers['x-forwarded-for'];
      const clientIp =
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0].trim()
          : request.socket.remoteAddress || 'unknown';
      const rateLimit = rateLimiter.check(clientIp);

      if (!rateLimit.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
        response.setHeader('retry-after', retryAfterSeconds);
        sendJson(response, 429, { error: 'Too many requests.', retryAfterSeconds });
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const match = /^\/api\/v1\/sites\/([^/]+)$/.exec(url.pathname);

      if (!match) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
      }

      const siteId = assertValidSiteId(decodeURIComponent(match[1]));

      if (request.method === 'GET') {
        const site = await store.getSite(siteId);

        if (!site) {
          sendJson(response, 404, { error: 'Site not found.', siteId });
          return;
        }

        sendJson(response, 200, site);
        return;
      }

      if (request.method === 'PUT') {
        const body = await readJsonBody(request);
        validateUpsertBody(body);
        const site = await store.putSite(siteId, body);
        sendJson(response, 200, site);
        return;
      }

      if (request.method === 'DELETE') {
        const body = await readJsonBody(request);
        validateDeleteBody(body);
        const deleted = await store.deleteSite(siteId, body);

        if (!deleted) {
          sendJson(response, 404, { error: 'Site not found.', siteId });
          return;
        }

        sendNoContent(response);
        return;
      }

      sendJson(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
      if (error instanceof ConflictError) {
        sendJson(response, 409, { error: error.message });
        return;
      }

      if (error instanceof AuthError) {
        sendJson(response, 401, { error: error.message });
        return;
      }

      if (error.message === 'INVALID_JSON') {
        sendJson(response, 400, { error: 'Invalid JSON body.' });
        return;
      }

      if (error.message === 'INVALID_SITE_ID') {
        sendJson(response, 400, { error: 'Invalid siteId.' });
        return;
      }

      if (error instanceof Error) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      sendJson(response, 500, { error: 'Internal server error.' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createServer();

  server.listen(config.port, config.host, () => {
    console.log(`ProtectedText API listening on http://${config.host}:${config.port}`);
  });
}

