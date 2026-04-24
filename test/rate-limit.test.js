import test from 'node:test';
import assert from 'node:assert/strict';

import { RateLimiter } from '../src/lib/rate-limit.js';

test('allows requests until the configured limit is reached', () => {
  const limiter = new RateLimiter({ windowMs: 1_000, maxRequests: 2 });

  const first = limiter.check('127.0.0.1');
  const second = limiter.check('127.0.0.1');
  const third = limiter.check('127.0.0.1');

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});
