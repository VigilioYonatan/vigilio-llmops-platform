import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WHITELISTED_SECRET_KEYS = [
  'DATABASE_URL',
  'ENCRYPTION_KEY_B64',
  'ENCRYPTION_PREVIOUS_KEYS_B64',
  'FACEBOOK_APP_SECRET',
  'SMTP_PASSWORD',
  'METRICS_TOKEN',
  'VALKEY_URL',
  'NATS_URL',
] as const;

/** Load only explicitly whitelisted secret file references; never print secret values. */
export function loadSecretFiles(): void {
  // Load local .env fallback if DATABASE_URL is not set
  if (!process.env.DATABASE_URL) {
    const candidates = [
      resolve(process.cwd(), '.env'),
      resolve(process.cwd(), 'apps', 'vigilio-llmops-impl', '.env'),
      resolve(__dirname, '..', '..', '..', '.env'),
    ];
    for (const envPath of candidates) {
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, 'utf8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim();
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
          break;
        } catch {
          // Ignore file read error
        }
      }
    }
  }

  for (const key of WHITELISTED_SECRET_KEYS) {
    const file = process.env[`${key}_FILE`];
    if (file) {
      const secret = readFileSync(file, 'utf8').trim();
      if (!secret) throw new Error(`Empty secret file for ${key}`);
      process.env[key] = secret;
    }
  }
}
