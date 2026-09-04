type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, cachedAt: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}

export function buildCacheKey(endpoint: string, payload: unknown): string {
  return `${endpoint}:${JSON.stringify(payload)}`;
}
