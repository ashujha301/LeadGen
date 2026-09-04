import Bottleneck from "bottleneck";

export type EndpointLimiterKey = "company_enrich" | "person_search" | "person_enrich";

const limiters = new Map<EndpointLimiterKey, Bottleneck>();

function createLimiter(requestsPerMinute: number): Bottleneck {
  const minTime = Math.ceil(60_000 / Math.max(requestsPerMinute, 1));
  return new Bottleneck({
    minTime,
    maxConcurrent: 1,
    reservoir: requestsPerMinute,
    reservoirRefreshAmount: requestsPerMinute,
    reservoirRefreshInterval: 60_000,
  });
}

export function configureEndpointLimiter(
  key: EndpointLimiterKey,
  requestsPerMinute: number,
): void {
  limiters.set(key, createLimiter(requestsPerMinute));
}

export function getEndpointLimiter(key: EndpointLimiterKey): Bottleneck {
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = createLimiter(12);
    limiters.set(key, limiter);
  }
  return limiter;
}

export function resetEndpointLimiters(): void {
  limiters.clear();
}

export function effectiveRpm(reported: number | undefined, configuredCap: number): number {
  if (!reported || reported <= 0) {
    return configuredCap;
  }
  return Math.min(Math.floor(reported * 0.8), configuredCap);
}
