/**
 * @module rate-limit
 * In-memory sliding-window rate limiter keyed by an arbitrary string (typically
 * the client IP address).
 *
 * Each unique key gets its own independent counter. When a window expires the
 * counter resets automatically on the next request. Expired buckets are pruned
 * during every new-window creation to prevent unbounded memory growth.
 */

export class RateLimiter {
  /** @type {number} Window duration in milliseconds. */
  #windowMs;

  /** @type {number} Maximum requests allowed per key per window. */
  #maxRequests;

  /**
   * Active rate-limit buckets, keyed by client identifier.
   * @type {Map<string, { count: number, resetAt: number }>}
   */
  #buckets = new Map();

  /**
   * @param {{ windowMs: number, maxRequests: number }} options
   */
  constructor({ windowMs, maxRequests }) {
    this.#windowMs = windowMs;
    this.#maxRequests = maxRequests;
  }

  /**
   * Records a request for `key` and returns the current rate-limit status.
   *
   * - If no bucket exists, or the existing window has expired, a fresh window
   *   is started and the request is allowed.
   * - If the bucket is within the window and under the limit, the counter is
   *   incremented and the request is allowed.
   * - If the limit has been reached the request is denied; the counter is NOT
   *   incremented (no point counting beyond the limit).
   *
   * @param {string} key - Client identifier (e.g. IP address).
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
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

  /**
   * Removes all expired buckets.
   * Called on every new-window creation to keep memory bounded.
   *
   * @param {number} now - Current timestamp from `Date.now()`.
   */
  #cleanup(now) {
    for (const [key, value] of this.#buckets.entries()) {
      if (value.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}

