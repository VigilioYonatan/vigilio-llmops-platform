import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from './config';

export const randomToken = (size = 32): string =>
  randomBytes(size).toString('base64url');
export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export function constantEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hmacVerify(
  value: string,
  digest: string,
  secret: string,
): boolean {
  return constantEqual(
    createHmac('sha256', secret).update(value).digest('base64url'),
    digest,
  );
}

function primaryEncryptionKey(): Buffer {
  const raw = Buffer.from(config.ENCRYPTION_KEY_B64 ?? '', 'base64');
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY_B64 must encode exactly 32 random bytes');
  }
  return raw;
}

function keyRing(): Buffer[] {
  const keys = [primaryEncryptionKey()];
  const previous = (config.ENCRYPTION_PREVIOUS_KEYS_B64 ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const encoded of previous) {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length !== 32) {
      throw new Error(
        'Each key in ENCRYPTION_PREVIOUS_KEYS_B64 must encode 32 bytes',
      );
    }
    keys.push(buf);
  }
  return keys;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', primaryEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split('.');
  let iv: string | undefined;
  let tag: string | undefined;
  let encrypted: string | undefined;

  if (parts.length === 4 && parts[0] === 'v1') {
    [, iv, tag, encrypted] = parts;
  } else if (parts.length === 3) {
    [iv, tag, encrypted] = parts;
  } else {
    throw new Error('Invalid secret format');
  }

  if (!iv || !tag || !encrypted) {
    throw new Error('Invalid secret format');
  }

  const ivBuf = Buffer.from(iv, 'base64url');
  const tagBuf = Buffer.from(tag, 'base64url');
  const ctBuf = Buffer.from(encrypted, 'base64url');

  let lastError: unknown;
  for (const key of keyRing()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
      decipher.setAuthTag(tagBuf);
      return Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString(
        'utf8',
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to decrypt secret');
}

export function totpValue(secret: Buffer, time = Date.now()): string {
  const count = Math.floor(time / 30000);
  const data = Buffer.alloc(8);
  data.writeBigUInt64BE(BigInt(count));
  const digest = createHmac('sha1', secret).update(data).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, '0');
}

export function verifyTotpWithStep(
  secret: Buffer,
  candidate: string,
  now = Date.now(),
): { valid: boolean; matchedStep: number | null } {
  if (!/^\d{6}$/.test(candidate)) {
    return { valid: false, matchedStep: null };
  }
  const baseStep = Math.floor(now / 30000);
  for (const delta of [0, -1, 1]) {
    if (
      constantEqual(totpValue(secret, (baseStep + delta) * 30000), candidate)
    ) {
      return { valid: true, matchedStep: baseStep + delta };
    }
  }
  return { valid: false, matchedStep: null };
}

export function verifyTotp(
  secret: Buffer,
  candidate: string,
  now = Date.now(),
): boolean {
  return verifyTotpWithStep(secret, candidate, now).valid;
}
