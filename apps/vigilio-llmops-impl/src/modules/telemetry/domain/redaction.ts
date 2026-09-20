/** Metadata allowlist: content, email, keys, prompts and tool arguments are rejected. */
const allowed = new Set([
  'release_id',
  'environment',
  'prompt_version',
  'sdk',
  'error_code',
  'step',
  'component',
  'retry',
  'result',
  'source',
]);

export function safeAttributes(
  attributes: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key, val]) =>
        allowed.has(key) && !(typeof val === 'string' && val.length > 250),
    ),
  );
}

export function nanoDurationMs(start: string, end: string): number {
  const d = BigInt(end) - BigInt(start);
  if (d < 0n || d > 86400000000000n) {
    throw new RangeError('Invalid span duration');
  }
  return Number(d / 1000000n);
}
