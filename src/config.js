import path from 'node:path';

const cwd = process.cwd();

function readPort(value) {
  const parsed = Number.parseInt(value ?? '3000', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: readPort(process.env.PORT),
  dataFile: process.env.DATA_FILE || path.join(cwd, 'data', 'sites.json'),
  rateLimitWindowMs: readPort(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
  rateLimitMaxRequests: readPort(process.env.RATE_LIMIT_MAX_REQUESTS ?? '60')
};

