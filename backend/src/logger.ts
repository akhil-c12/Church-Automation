import { pino, type Logger } from 'pino';
import type { Config } from './config.js';

/** Masks phone-like digit runs (7+ digits), keeping the last 4: 9876543210 -> ******3210. */
export function maskPhones(value: string): string {
  return value.replace(/\+?\d{7,}/g, (m) => '*'.repeat(m.length - 4) + m.slice(-4));
}

export function createLogger(config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
    base: { service: 'church-birthday-backend' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Defence in depth: nothing should log these, but if someone does, scrub them.
    redact: {
      paths: [
        'password',
        '*.password',
        'headers.cookie',
        'headers.authorization',
        'headers["x-api-key"]',
        'headers["x-callback-key"]',
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers["x-callback-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  });
}
