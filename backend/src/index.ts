import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

if (existsSync('.env')) process.loadEnvFile('.env');

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const { app, logger, shutdown } = createApp(config);

const server = app.listen(config.PORT, () => {
  // Safe to log: config validation rejects credentials/query strings in this URL.
  logger.info({ port: config.PORT, env: config.NODE_ENV, n8n_base: config.N8N_WEBHOOK_BASE }, 'server listening');
});

// A request can wait on up to 3 n8n attempts, so allow well beyond 3 × N8N_TIMEOUT_MS.
server.requestTimeout = config.N8N_TIMEOUT_MS * 3 + 15_000;
server.headersTimeout = 20_000;
// Longer than typical load-balancer idle timeouts (60 s) to avoid 502s on reused sockets.
server.keepAliveTimeout = 65_000;

let stopping = false;
function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  shutdown(); // close SSE streams so server.close() can finish
  server.close((err) => {
    if (err) logger.error({ err }, 'error during shutdown');
    process.exit(err ? 1 : 0);
  });
  setTimeout(() => {
    logger.warn('forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  stop('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
