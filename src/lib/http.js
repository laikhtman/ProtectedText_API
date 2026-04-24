/**
 * @module http
 * Thin helpers around Node's `http.IncomingMessage` / `http.ServerResponse` so
 * the rest of the codebase doesn't have to deal with raw stream chunking or
 * manual header construction.
 */

/**
 * Reads and JSON-parses the full request body.
 * An empty body is treated as `{}` rather than an error.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<Record<string, unknown>>} Parsed JSON object.
 * @throws {Error} `'INVALID_JSON'` if the body cannot be parsed as JSON.
 */
export async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

/**
 * Sends a JSON response with the correct `content-type` and `content-length`
 * headers set. Automatically serializes `payload` with 2-space indentation.
 *
 * @param {import('node:http').ServerResponse} response
 * @param {number} statusCode - HTTP status code (e.g. 200, 400, 404).
 * @param {unknown} payload   - Value to serialize as JSON.
 */
export function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

/**
 * Sends a response with no body (default 204 No Content).
 *
 * @param {import('node:http').ServerResponse} response
 * @param {number} [statusCode=204]
 */
export function sendNoContent(response, statusCode = 204) {
  response.writeHead(statusCode);
  response.end();
}

