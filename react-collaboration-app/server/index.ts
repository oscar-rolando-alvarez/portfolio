import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCollaborationServer } from './app.ts';
import { logger } from './logger.ts';

const port = Number(process.env.PORT ?? 3001);
const corsOrigins = (process.env.CLIENT_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const { app, httpServer, io } = createCollaborationServer({ corsOrigins });

// In production the same process serves the built SPA, so a single container
// exposes the UI, REST API and WebSocket endpoint on one port.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: distDir }));
  logger.info('serving static client', { distDir });
}

httpServer.listen(port, () => {
  logger.info('server listening', { port, env: process.env.NODE_ENV ?? 'development', corsOrigins });
});

function shutdown(signal: string) {
  logger.info('shutting down', { signal });
  // Closes all sockets and the underlying HTTP server.
  void io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
