/**
 * @module config
 * Central configuration for the API server.
 * All values are read from environment variables with safe defaults so the
 * server can be deployed without any configuration file.
 */

import path from 'node:path';

const cwd = process.cwd();

/**
 * Parses an environment variable as a positive integer.
 * Returns `defaultValue` when the variable is absent, empty, or non-numeric.
 *
 * @param {string|undefined} value - Raw environment variable string.
 * @param {number} defaultValue - Fallback value.
 * @returns {number}
 */
function readInt(value, defaultValue) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Application-wide runtime configuration.
 *
 * Environment variables:
 * - `HOST`                    — bind address (default `127.0.0.1`)
 * - `PORT`                    — TCP port (default `3000`)
 * - `DATA_FILE`               — path to the JSON store (default `data/sites.json`)
 * - `RATE_LIMIT_WINDOW_MS`    — sliding-window duration in ms (default `60000`)
 * - `RATE_LIMIT_MAX_REQUESTS` — max requests per IP per window (default `60`)
 */
export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: readInt(process.env.PORT, 3000),
  dataFile: process.env.DATA_FILE || path.join(cwd, 'data', 'sites.json'),
  rateLimitWindowMs: readInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMaxRequests: readInt(process.env.RATE_LIMIT_MAX_REQUESTS, 60)
};

