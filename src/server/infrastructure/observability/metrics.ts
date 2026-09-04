export type MetricLabels = Record<string, string | number | boolean>;

export type CounterMetric = {
  increment(name: string, value?: number, labels?: MetricLabels): void;
};

export type HistogramMetric = {
  observe(name: string, value: number, labels?: MetricLabels): void;
};

export type MetricsClient = CounterMetric & HistogramMetric;

/**
 * Stub metrics client for future Prometheus/OpenTelemetry integration.
 */
export function createMetricsClient(): MetricsClient {
  return {
    increment(_name: string, _value = 1, _labels?: MetricLabels): void {
      // no-op stub
    },
    observe(_name: string, _value: number, _labels?: MetricLabels): void {
      // no-op stub
    },
  };
}

export const metrics = createMetricsClient();
