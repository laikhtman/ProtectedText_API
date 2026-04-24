export class RateLimiter {
  #windowMs;
  #maxRequests;
  #buckets = new Map();

  constructor({ windowMs, maxRequests }) {
    this.#windowMs = windowMs;
    this.#maxRequests = maxRequests;
  }

  check(key) {
    const now = Date.now();
    const existing = this.#buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.#windowMs;
      this.#buckets.set(key, { count: 1, resetAt });
      this.#cleanup(now);
      return {
        allowed: true,
        remaining: this.#maxRequests - 1,
        resetAt
      };
    }

    if (existing.count >= this.#maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.#maxRequests - existing.count,
      resetAt: existing.resetAt
    };
  }

  #cleanup(now) {
    for (const [key, value] of this.#buckets.entries()) {
      if (value.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}
