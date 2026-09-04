import { RATE_LIMITS } from "@/shared/config";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getBucket(key: string, windowMs: number): Bucket {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const bucket: Bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return bucket;
  }

  return existing;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const bucket = getBucket(key, windowMs);
  bucket.count += 1;

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function checkNaturalSearchLimit(clientKey: string) {
  return checkRateLimit(`natural:${clientKey}`, RATE_LIMITS.naturalSearchPerMinute);
}

export function checkReadApiLimit(clientKey: string) {
  return checkRateLimit(`read:${clientKey}`, RATE_LIMITS.readApiPerMinute);
}
