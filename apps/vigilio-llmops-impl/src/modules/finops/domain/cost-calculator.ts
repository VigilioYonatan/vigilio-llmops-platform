const SCALE = 100_000_000n; // 1e8 micro-cents per 1 USD

export function parseDecimalToScaled(value: string, decimals = 8): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string: ${value}`);
  }
  const [wholePart = '0', fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  return (
    BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0')
  );
}

export function formatScaledDecimal(scaled: bigint, decimals = 6): string {
  const factor = 10n ** BigInt(decimals);
  const adjusted =
    decimals === 8
      ? scaled
      : decimals < 8
        ? (scaled + 10n ** BigInt(8 - decimals) / 2n) /
          10n ** BigInt(8 - decimals)
        : scaled * 10n ** BigInt(decimals - 8);
  const whole = adjusted / factor;
  const frac = (adjusted % factor).toString().padStart(decimals, '0');
  return `${whole.toString()}.${frac}`;
}

/**
 * Computes exact USD cost from token counts and per-million-token prices using BigInt fixed-point math.
 */
export function calculateTokenCostUsd(
  inputTokens: number,
  outputTokens: number,
  priceInputPerMillion: string,
  priceOutputPerMillion: string,
): { budgetUsd6: string; ledgerUsd8: string } {
  const safeIn = BigInt(Math.max(0, Math.trunc(inputTokens)));
  const safeOut = BigInt(Math.max(0, Math.trunc(outputTokens)));
  const inRate = parseDecimalToScaled(priceInputPerMillion, 8);
  const outRate = parseDecimalToScaled(priceOutputPerMillion, 8);
  // Rate is per 1,000,000 tokens; round half-up to 1e-8 USD
  const rawNumerator = safeIn * inRate + safeOut * outRate;
  const scaled8 = (rawNumerator + 500_000n) / 1_000_000n;
  void SCALE;
  return {
    budgetUsd6: formatScaledDecimal(scaled8, 6),
    ledgerUsd8: formatScaledDecimal(scaled8, 8),
  };
}
