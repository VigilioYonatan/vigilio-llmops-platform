export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: Array<{ path: string[]; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const cookieNames = ['__Host-vigilio-csrf', 'vigilio-csrf'];

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  for (const name of cookieNames) {
    const found = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${name}=`));
    if (found) return decodeURIComponent(found.slice(name.length + 1));
  }
  return null;
}

function generateCorrelationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const csrf = csrfToken();
  const headers = new Headers(options.headers);

  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('content-type')
  ) {
    headers.set('content-type', 'application/json');
  }

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    csrf &&
    !headers.has('x-csrf-token')
  ) {
    headers.set('x-csrf-token', csrf);
  }

  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', generateCorrelationId());
  }

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      error?: {
        message?: string | string[];
        issues?: Array<{ path: string[]; message: string }>;
      };
      message?: string | string[];
    } | null;

    const issues = failure?.error?.issues;
    let text = failure?.error?.message ?? failure?.message;

    if (issues && issues.length > 0 && !text) {
      text = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    }

    const message = Array.isArray(text)
      ? text.join(', ')
      : (text ?? `Request failed (${response.status})`);
    throw new ApiError(response.status, message, issues);
  }

  // Handle 204 No Content vs empty 200 JSON/null responses safely for TanStack Query v5
  const contentLength = response.headers?.get
    ? response.headers.get('content-length')
    : null;
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  if (contentLength === '0') {
    return null as unknown as T;
  }

  const contentType = response.headers?.get
    ? (response.headers.get('content-type') ?? '')
    : '';
  if (
    !contentType.includes('application/json') &&
    typeof response.text === 'function'
  ) {
    const rawText = await response.text();
    if (rawText.length === 0) {
      return null as unknown as T;
    }
    return rawText as unknown as T;
  }

  if (typeof response.json === 'function') {
    return response.json() as Promise<T>;
  }

  return undefined as unknown as T;
}

export function post<T>(
  path: string,
  data: unknown,
  options?: Omit<RequestInit, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function put<T>(
  path: string,
  data: unknown,
  options?: Omit<RequestInit, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function patch<T>(
  path: string,
  data: unknown,
  options?: Omit<RequestInit, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function remove<T>(
  path: string,
  options?: Omit<RequestInit, 'method'>,
): Promise<T> {
  return api<T>(path, { ...options, method: 'DELETE' });
}
