import type { EndpointLimiterKey } from "./rate-limiter";

const BREAKER_DURATION_MS = 5 * 60 * 1000;

type CircuitState = {
  openUntil: number;
};

const breakers = new Map<EndpointLimiterKey, CircuitState>();

export function resetCircuitBreakers(): void {
  breakers.clear();
}

export function isEndpointCircuitOpen(key: EndpointLimiterKey): boolean {
  const state = breakers.get(key);
  if (!state) {
    return false;
  }
  if (Date.now() >= state.openUntil) {
    breakers.delete(key);
    return false;
  }
  return true;
}

export function openEndpointCircuit(key: EndpointLimiterKey, durationMs = BREAKER_DURATION_MS): void {
  breakers.set(key, { openUntil: Date.now() + durationMs });
}

export function closeEndpointCircuit(key: EndpointLimiterKey): void {
  breakers.delete(key);
}
