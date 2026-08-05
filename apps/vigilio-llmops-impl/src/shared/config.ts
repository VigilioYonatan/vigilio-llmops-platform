import { loadSecretFiles } from './secret-files';

loadSecretFiles();

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  DB_SSL_MODE: z.enum(['disable', 'verify-full']).default('disable'),
  VALKEY_URL: z.string().default('redis://localhost:6379'),
  NATS_URL: z.string().default('nats://localhost:4222'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v23.0'),
  ALLOWED_MODEL_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  ALLOW_LOOPBACK_MODEL_URL: z.enum(['true', 'false']).default('true'),
  MODEL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(30000),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  ENCRYPTION_KEY_B64: z.string().optional(),
  ENCRYPTION_PREVIOUS_KEYS_B64: z.string().optional(),
  METRICS_TOKEN: z.string().min(24).optional(),
});

export const config = schema.parse(process.env);
export const isProduction = config.NODE_ENV === 'production';

export const cookieNames = {
  session:
    config.SESSION_COOKIE_SECURE === 'true'
      ? '__Host-vigilio-session'
      : 'vigilio-session',
  csrf:
    config.SESSION_COOKIE_SECURE === 'true'
      ? '__Host-vigilio-csrf'
      : 'vigilio-csrf',
  oauth:
    config.SESSION_COOKIE_SECURE === 'true'
      ? '__Host-vigilio-oauth'
      : 'vigilio-oauth',
} as const;

if (isProduction && config.SESSION_COOKIE_SECURE !== 'true') {
  throw new Error('Production requires secure cookies');
}
