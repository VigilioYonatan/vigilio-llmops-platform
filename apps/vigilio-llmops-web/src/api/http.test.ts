import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, patch, post, put, remove } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('browser API boundary', () => {
  it('uses same-origin cookies and sets correlation ID', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetcher);

    const res = await api('/me');
    expect(res).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.any(Headers),
      }),
    );

    const callHeaders = fetcher.mock.calls[0]![1].headers as Headers;
    expect(callHeaders.get('x-correlation-id')).toBeDefined();
  });

  it('handles post, put, patch and remove helpers', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetcher);

    await post('/items', { name: 'test' });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
    );

    await put('/items/1', { name: 'updated' });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/items/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'updated' }),
      }),
    );

    await patch('/items/1', { name: 'patched' });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/items/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'patched' }),
      }),
    );

    await remove('/items/1');
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/items/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('handles 204 No Content without attempting JSON parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
      }),
    );

    const res = await api('/items/1', { method: 'DELETE' });
    expect(res).toBeUndefined();
  });

  it('returns null instead of undefined on 200 OK with empty body so TanStack Query v5 never crashes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '0' }),
      }),
    );

    const res = await api('/budgets?organization_id=org-1');
    expect(res).toBeNull();
  });

  it('handles text responses when content-type is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'pong',
      }),
    );

    const res = await api('/health');
    expect(res).toBe('pong');
  });

  it('handles randomUUID fallback when crypto.randomUUID is not present', async () => {
    const origCrypto = globalThis.crypto;
    // @ts-expect-error
    delete globalThis.crypto;

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetcher);

    await api('/health');
    const callHeaders = fetcher.mock.calls[0]![1].headers as Headers;
    expect(callHeaders.get('x-correlation-id')).toMatch(/^req-\d+-/);

    globalThis.crypto = origCrypto;
  });

  it('formats error message when issues are present without explicit message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            issues: [
              { path: ['user', 'email'], message: 'Correo obligatorio' },
              { path: ['password'], message: 'Muy corta' },
            ],
          },
        }),
      }),
    );

    try {
      await api('/test-error');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe(
        'user.email: Correo obligatorio, password: Muy corta',
      );
    }
  });

  it('includes CSRF token on mutating requests when cookie exists', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'vigilio-csrf=secret-csrf-token-12345',
    });

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetcher);

    await post('/test', { data: 1 });
    const callHeaders = fetcher.mock.calls[0]![1].headers as Headers;
    expect(callHeaders.get('x-csrf-token')).toBe('secret-csrf-token-12345');
  });
});
