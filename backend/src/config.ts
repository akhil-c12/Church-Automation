import { z } from 'zod';

const BCRYPT_HASH = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Number of reverse-proxy hops in front of the app (0 = none). Never `true`:
    // that would let any client spoof X-Forwarded-For and dodge rate limits.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    FRONTEND_ORIGIN: z
      .string()
      .url()
      .transform((v) => new URL(v))
      .refine((u) => u.protocol === 'http:' || u.protocol === 'https:', 'must be http(s)')
      .refine((u) => (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash, 'must be an origin only, e.g. https://admin.example.org')
      .transform((u) => u.origin),

    ADMIN_USERNAME: z.string().trim().min(1).max(100),
    ADMIN_PASSWORD_HASH: z.string().regex(BCRYPT_HASH, 'must be a bcrypt hash (run `npm run hash-password`)'),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_TTL_HOURS: z.coerce.number().positive().max(168).default(12),

    N8N_WEBHOOK_BASE: z
      .string()
      .url()
      .transform((v) => v.replace(/\/+$/, '')),
    N8N_API_KEY: z.string().min(16, 'must be at least 16 characters'),
    N8N_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(30_000),
    N8N_CALLBACK_KEY: z.string().min(32, 'must be at least 32 characters'),
  })
  .superRefine((env, ctx) => {
    const base = new URL(env.N8N_WEBHOOK_BASE);
    if (env.NODE_ENV === 'production') {
      if (base.protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', path: ['N8N_WEBHOOK_BASE'], message: 'must use https in production' });
      }
      if (!env.FRONTEND_ORIGIN.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['FRONTEND_ORIGIN'], message: 'must use https in production' });
      }
    }
    if (base.username || base.password || base.search || base.hash) {
      ctx.addIssue({ code: 'custom', path: ['N8N_WEBHOOK_BASE'], message: 'must not contain credentials, query or fragment' });
    }
    if (env.N8N_CALLBACK_KEY === env.N8N_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['N8N_CALLBACK_KEY'], message: 'must differ from N8N_API_KEY' });
    }
    if (env.JWT_SECRET === env.N8N_API_KEY || env.JWT_SECRET === env.N8N_CALLBACK_KEY) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'must not reuse another secret' });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {}

/**
 * Validates the environment. Throws ConfigError listing only variable names and
 * rule messages — never the values, so secrets can't end up in crash logs.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings as missing so `JWT_SECRET=` in .env fails "required".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze(parsed.data);
}
