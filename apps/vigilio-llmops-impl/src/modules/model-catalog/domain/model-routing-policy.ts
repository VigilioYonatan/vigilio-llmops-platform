export function isValidFallbackPair(
  primaryModelId: string,
  fallbackModelId: string | null,
): boolean {
  return fallbackModelId === null || primaryModelId !== fallbackModelId;
}
