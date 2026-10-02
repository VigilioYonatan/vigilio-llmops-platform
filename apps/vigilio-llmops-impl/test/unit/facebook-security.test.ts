import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeSignedRequest,
  returnPath,
} from '../../src/modules/identity/application/facebook.service';

function sign(payload: Record<string, unknown>, secret: string) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${createHmac('sha256', secret).update(data).digest('base64url')}.${data}`;
}
describe('Facebook OAuth + data deletion boundary', () => {
  const issued_at = Math.floor(Date.now() / 1000);
  it('accepts valid Meta signed_request', () =>
    expect(
      decodeSignedRequest(
        sign(
          { algorithm: 'HMAC-SHA256', issued_at, user_id: 'subject1' },
          'secret',
        ),
        'secret',
      ).user_id,
    ).toBe('subject1'));
  it('rejects wrong key', () =>
    expect(() =>
      decodeSignedRequest(
        sign(
          { algorithm: 'HMAC-SHA256', issued_at, user_id: 'subject1' },
          'secret',
        ),
        'other',
      ),
    ).toThrow());
  it('rejects altered payload', () => {
    const req = sign(
      { algorithm: 'HMAC-SHA256', issued_at, user_id: 'subject1' },
      'secret',
    );
    expect(() => decodeSignedRequest(`${req}a`, 'secret')).toThrow();
  });
  it('rejects old request', () =>
    expect(() =>
      decodeSignedRequest(
        sign(
          {
            algorithm: 'HMAC-SHA256',
            issued_at: issued_at - 90000,
            user_id: 'subject1',
          },
          'secret',
        ),
        'secret',
      ),
    ).toThrow());
  it('rejects unsigned or malformed input', () =>
    expect(() => decodeSignedRequest('malformed', 'secret')).toThrow());
  it('restricts redirect to a local path', () =>
    expect(returnPath('/app/traces')).toBe('/app/traces'));
  it('blocks protocol-relative redirect', () =>
    expect(returnPath('//evil.example/path')).toBe('/app'));
  it('blocks backslash redirect', () =>
    expect(returnPath('/\\evil.example')).toBe('/app'));
  it('blocks external redirect', () =>
    expect(returnPath('https://evil.example')).toBe('/app'));
});
