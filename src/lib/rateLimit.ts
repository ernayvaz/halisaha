type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: limit, updatedAt: now };
  const elapsed = now - b.updatedAt;
  const refill = Math.floor((elapsed / windowMs) * limit);
  b.tokens = Math.min(limit, b.tokens + (refill > 0 ? refill : 0));
  b.updatedAt = refill > 0 ? now : b.updatedAt;
  if (b.tokens <= 0) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}


