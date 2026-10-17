import { serve } from '@hono/node-server';
import { createLogger, setupTelemetry } from '@aco/infra';
import { loadConfig } from './config.ts';
import { createContainer } from './container.ts';
import { createApp } from './http/app.ts';

const config = loadConfig();
const telemetry = setupTelemetry({
  serviceName: config.OTEL_SERVICE_NAME,
  serviceVersion: '0.1.0',
  otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});
const logger = createLogger({ level: config.LOG_LEVEL });
if (config.ephemeralKeys) {
  logger.warn({}, 'PII keys not configured: using ephemeral keys (tokens will not survive a restart)');
}

const container = await createContainer(config, { logger });
const app = createApp(container);
const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
  logger.info(
    { port: info.port, storage: config.STORAGE, llm: config.LLM_PROVIDER, mcp: config.MCP_TRANSPORT },
    'listening',
  );
});

// Crash recovery: re-drive runs whose worker died (expired lease), at startup and periodically.
const recover = () =>
  container.orchestrator.recover().then(
    (ids) => {
      if (ids.length > 0) logger.warn({ count: ids.length }, 'recovered runs');
    },
    (err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'recovery failed');
    },
  );
void recover();
const timer =
  config.RECOVERY_INTERVAL_MS > 0
    ? setInterval(() => void recover(), config.RECOVERY_INTERVAL_MS)
    : undefined;

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  clearInterval(timer);
  server.close();
  await container.close();
  await telemetry.shutdown();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
