export const ALLOWED_API_KEY_SCOPES = [
  'traces:write',
  'gateway:execute',
] as const;
export type ApiKeyScope = (typeof ALLOWED_API_KEY_SCOPES)[number];

export function formatApiKeyPrefix(token: string): string {
  return token.slice(0, 12);
}
