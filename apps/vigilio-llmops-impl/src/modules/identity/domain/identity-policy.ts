import { createHmac, timingSafeEqual } from 'node:crypto';

export function constantTimeStringEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sanitizeReturnPath(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    input.includes('://') ||
    input.split('').some((c) => c.charCodeAt(0) < 32)
  ) {
    return '/app';
  }
  return input;
}

export function base32Encode(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }
  return result;
}

export function isRecentMfaTimestamp(
  mfaVerifiedAt: Date | string | null | undefined,
  now = Date.now(),
  windowMs = 300_000,
): boolean {
  if (!mfaVerifiedAt) return false;
  const ts = new Date(mfaVerifiedAt).getTime();
  return Number.isFinite(ts) && ts <= now + 5_000 && now - ts <= windowMs;
}

export function verifyMetaSignedRequestRaw(
  signedRequest: string,
  secret: string,
  now = Date.now(),
):
  | { ok: true; user_id: string; issued_at: number }
  | { ok: false; reason: string } {
  const parts = signedRequest.split('.');
  if (parts.length !== 2)
    return { ok: false, reason: 'Invalid signed request' };
  const [signature, payload] = parts;
  if (!signature || !payload)
    return { ok: false, reason: 'Invalid signed request' };
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  if (!constantTimeStringEqual(expected, signature)) {
    return { ok: false, reason: 'Invalid webhook signature' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'Invalid webhook data' };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Record<string, unknown>).algorithm !== 'HMAC-SHA256' ||
    typeof (parsed as Record<string, unknown>).issued_at !== 'number' ||
    typeof (parsed as Record<string, unknown>).user_id !== 'string' ||
    ((parsed as Record<string, unknown>).user_id as string).length < 1
  ) {
    return { ok: false, reason: 'Invalid webhook data' };
  }
  const data = parsed as { user_id: string; issued_at: number };
  if (Math.abs(Math.floor(now / 1000) - data.issued_at) > 24 * 3600) {
    return { ok: false, reason: 'Expired signed request' };
  }
  return { ok: true, user_id: data.user_id, issued_at: data.issued_at };
}
