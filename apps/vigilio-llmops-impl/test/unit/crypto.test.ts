import { describe, expect, it } from 'vitest';
import {
  constantEqual,
  decryptSecret,
  encryptSecret,
  hmacVerify,
  randomToken,
  sha256,
  totpValue,
  verifyTotp,
  verifyTotpWithStep,
} from '../../src/shared/crypto';

describe('token handling, encryption and TOTP', () => {
  it('generates distinct high entropy tokens', () =>
    expect(randomToken()).not.toBe(randomToken()));

  it('hashes tokens deterministically', () =>
    expect(sha256('one')).toBe(sha256('one')));

  it('protects compare against differing size', () =>
    expect(constantEqual('long', 'short')).toBe(false));

  it('compares equal digests', () =>
    expect(constantEqual('abc', 'abc')).toBe(true));

  it('verifies HMAC digests safely', () => {
    const secret = 'super-secret';
    const message = 'payload';
    // Generate valid HMAC
    const validHmac = require('node:crypto')
      .createHmac('sha256', secret)
      .update(message)
      .digest('base64url');
    expect(hmacVerify(message, validHmac, secret)).toBe(true);
    expect(hmacVerify(message, 'wrong-digest', secret)).toBe(false);
  });

  it('validates known TOTP generated in the same step', () => {
    const secret = Buffer.from('12345678901234567890');
    const now = 1234567890000;
    expect(verifyTotp(secret, totpValue(secret, now), now)).toBe(true);
  });

  it('rejects non numeric TOTP', () => {
    expect(verifyTotp(Buffer.alloc(20), 'abcdef')).toBe(false);
    expect(verifyTotp(Buffer.alloc(20), '12345')).toBe(false); // too short
  });

  it('verifies TOTP with step tracking across deltas', () => {
    const secret = Buffer.from('12345678901234567890');
    const now = 1234567890000;
    const baseStep = Math.floor(now / 30000);

    const codeCurrent = totpValue(secret, now);
    const res0 = verifyTotpWithStep(secret, codeCurrent, now);
    expect(res0.valid).toBe(true);
    expect(res0.matchedStep).toBe(baseStep);

    // Delta -1 (previous window)
    const codePrev = totpValue(secret, (baseStep - 1) * 30000);
    const resPrev = verifyTotpWithStep(secret, codePrev, now);
    expect(resPrev.valid).toBe(true);
    expect(resPrev.matchedStep).toBe(baseStep - 1);

    // Delta +1 (next window)
    const codeNext = totpValue(secret, (baseStep + 1) * 30000);
    const resNext = verifyTotpWithStep(secret, codeNext, now);
    expect(resNext.valid).toBe(true);
    expect(resNext.matchedStep).toBe(baseStep + 1);

    // Invalid code
    const resInvalid = verifyTotpWithStep(secret, '000000', now);
    if (
      codeCurrent !== '000000' &&
      codePrev !== '000000' &&
      codeNext !== '000000'
    ) {
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.matchedStep).toBeNull();
    }
  });

  it('encrypts and decrypts secrets roundtrip', () => {
    const plain = 'sk-super-secret-model-api-key-12345';
    const encrypted = encryptSecret(plain);
    expect(encrypted.startsWith('v1.')).toBe(true);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('supports legacy 3-part format decryption', () => {
    const plain = 'legacy-payload';
    const v1Encrypted = encryptSecret(plain);
    const parts = v1Encrypted.split('.');
    // parts: ['v1', iv, tag, ct] -> 3-part: [iv, tag, ct]
    const legacy = [parts[1], parts[2], parts[3]].join('.');
    expect(decryptSecret(legacy)).toBe(plain);
  });

  it('rejects invalid or corrupted encrypted format', () => {
    expect(() => decryptSecret('invalid')).toThrow('Invalid secret format');
    expect(() => decryptSecret('v1.a.b.c.extra')).toThrow(
      'Invalid secret format',
    );
    expect(() => decryptSecret('v1...')).toThrow('Invalid secret format');

    // Tampered payload
    const enc = encryptSecret('secret');
    const parts = enc.split('.');
    const tampered = [parts[0], parts[1], parts[2], 'dGFtcGVyZWQ'].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
