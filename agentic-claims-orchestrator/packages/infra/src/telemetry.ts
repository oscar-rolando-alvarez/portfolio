import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion: string;
  /** OTLP/HTTP base endpoint, e.g. http://otel-collector:4318. Unset => no export (context still propagates). */
  otlpEndpoint?: string | undefined;
  environment?: string;
  extraSpanProcessors?: SpanProcessor[];
}

export interface Telemetry {
  shutdown(): Promise<void>;
}

/** Registers global tracer + meter providers. Call once, before anything creates spans. */
export function setupTelemetry(opts: TelemetryOptions): Telemetry {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.serviceName,
    [ATTR_SERVICE_VERSION]: opts.serviceVersion,
    'deployment.environment.name': opts.environment ?? 'local',
  });
  const spanProcessors: SpanProcessor[] = [...(opts.extraSpanProcessors ?? [])];
  if (opts.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${opts.otlpEndpoint.replace(/\/$/, '')}/v1/traces` }),
      ),
    );
  }
  const tracerProvider = new NodeTracerProvider({ resource, spanProcessors });
  tracerProvider.register();

  let meterProvider: MeterProvider | undefined;
  if (opts.otlpEndpoint) {
    meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${opts.otlpEndpoint.replace(/\/$/, '')}/v1/metrics` }),
          exportIntervalMillis: 15_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);
  }

  return {
    async shutdown() {
      await Promise.allSettled([tracerProvider.shutdown(), meterProvider?.shutdown()]);
    },
  };
}
