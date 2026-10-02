import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, sha256 } from '../../src/shared/crypto';

describe('async mail event confidentiality', () => {
  it('encrypts a verification token and decrypts in worker', () => {
    const token = 'this-is-a-secret-token';
    const ciphertext = encryptSecret(token);
    expect(ciphertext).not.toContain(token);
    expect(decryptSecret(ciphertext)).toBe(token);
  });
  it('hash-only token cannot be used as plaintext credential', () => {
    expect(sha256('token')).not.toBe('token');
  });
});
