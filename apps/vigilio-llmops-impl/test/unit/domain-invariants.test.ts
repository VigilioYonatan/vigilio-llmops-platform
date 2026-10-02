import { describe, expect, it } from 'vitest';
import {
  ALLOWED_API_KEY_SCOPES,
  formatApiKeyPrefix,
} from '../../src/modules/applications/domain/api-key-policy';
import {
  calibrationAgreement,
  evaluateDeterministic,
} from '../../src/modules/evaluations/domain/evaluator';
import {
  calculateTokenCostUsd,
  formatScaledDecimal,
  parseDecimalToScaled,
} from '../../src/modules/finops/domain/cost-calculator';
import {
  base32Encode,
  isRecentMfaTimestamp,
  verifyMetaSignedRequestRaw,
} from '../../src/modules/identity/domain/identity-policy';
import {
  chunkDocument,
  computeDeterministicEmbedding64,
  formatPgVector,
  fuseRrfScores,
} from '../../src/modules/knowledge/domain/hybrid-rag';
import { isValidFallbackPair } from '../../src/modules/model-catalog/domain/model-routing-policy';
import { ORG_ROLE_PERMISSIONS } from '../../src/modules/organizations/domain/org-permissions';
import {
  lineDiff,
  renderTemplateVariables,
  validateTemplate,
} from '../../src/modules/prompts/domain/prompt-template';
import {
  nanoDurationMs,
  safeAttributes,
} from '../../src/modules/telemetry/domain/redaction';

describe('Domain Invariants & Business Policies', () => {
  describe('api-key-policy', () => {
    it('formats token prefix correctly', () => {
      const token = 'vgl_live_123456789abcdef';
      expect(formatApiKeyPrefix(token)).toBe('vgl_live_123');
    });

    it('defines allowed API key scopes', () => {
      expect(ALLOWED_API_KEY_SCOPES).toContain('traces:write');
      expect(ALLOWED_API_KEY_SCOPES).toContain('gateway:execute');
    });
  });

  describe('evaluator', () => {
    it('evaluates exact match normalized', () => {
      expect(
        evaluateDeterministic('exact_match', 'Hello World', ' hello   world '),
      ).toBe(true);
      expect(evaluateDeterministic('exact_match', 'Hello', 'World')).toBe(
        false,
      );
    });

    it('evaluates contains', () => {
      expect(evaluateDeterministic('contains', 'World', 'Hello World!')).toBe(
        true,
      );
      expect(evaluateDeterministic('contains', 'Foo', 'Bar Baz')).toBe(false);
    });

    it('evaluates regex with safety bounds', () => {
      expect(evaluateDeterministic('regex', '^order-1234$', 'order-1234')).toBe(
        true,
      );
      expect(evaluateDeterministic('regex', '^order-1234$', 'order-abcd')).toBe(
        false,
      );
      // Malformed or unsafe regex rejected
      expect(evaluateDeterministic('regex', '(unbalanced', 'test')).toBe(false);
      expect(evaluateDeterministic('regex', 'a'.repeat(250), 'test')).toBe(
        false,
      );
    });

    it('calculates calibration agreement', () => {
      const labels = [
        { expected: 'A', actual: 'a', human_passed: true },
        { expected: 'B', actual: 'c', human_passed: false },
        { expected: 'D', actual: 'd', human_passed: false }, // mismatch with eval
      ];
      const res = calibrationAgreement('exact_match', labels);
      expect(res.total).toBe(3);
      expect(res.agreed).toBe(2);
      expect(res.agreement).toBeCloseTo(2 / 3);

      expect(() => calibrationAgreement('exact_match', [])).toThrow(
        'requires labelled cases',
      );
    });
  });

  describe('cost-calculator (FinOps fixed-point)', () => {
    it('parses decimal string to scaled BigInt', () => {
      expect(parseDecimalToScaled('1.5', 8)).toBe(150_000_000n);
      expect(parseDecimalToScaled('0.00000001', 8)).toBe(1n);
      expect(parseDecimalToScaled('42', 8)).toBe(4_200_000_000n);
      expect(() => parseDecimalToScaled('invalid')).toThrow();
    });

    it('formats scaled decimal to string', () => {
      expect(formatScaledDecimal(150_000_000n, 6)).toBe('1.500000');
      expect(formatScaledDecimal(1n, 8)).toBe('0.00000001');
    });

    it('calculates token costs deterministically in USD', () => {
      const res = calculateTokenCostUsd(1000, 2000, '2.50', '10.00');
      expect(Number(res.budgetUsd6)).toBeGreaterThan(0);
      expect(Number(res.ledgerUsd8)).toBeGreaterThan(0);
      // 1000 * 2.50 / 1e6 = 0.0025; 2000 * 10.00 / 1e6 = 0.0200 -> total = 0.0225 USD
      expect(res.budgetUsd6).toBe('0.022500');
      expect(res.ledgerUsd8).toBe('0.02250000');
    });
  });

  describe('identity-policy', () => {
    it('encodes bytes to base32', () => {
      const buf = Buffer.from('hello world', 'utf8');
      const b32 = base32Encode(buf);
      expect(typeof b32).toBe('string');
      expect(b32.length).toBeGreaterThan(0);
      expect(/^[A-Z2-7]+$/.test(b32)).toBe(true);
    });

    it('checks recent MFA timestamp within window', () => {
      const now = Date.now();
      expect(isRecentMfaTimestamp(new Date(now - 1000), now, 300_000)).toBe(
        true,
      );
      expect(isRecentMfaTimestamp(new Date(now - 400_000), now, 300_000)).toBe(
        false,
      );
      expect(isRecentMfaTimestamp(null, now)).toBe(false);
      expect(isRecentMfaTimestamp(undefined, now)).toBe(false);
    });

    it('rejects invalid or expired Meta signed requests', () => {
      expect(verifyMetaSignedRequestRaw('invalid', 'secret')).toEqual({
        ok: false,
        reason: 'Invalid signed request',
      });
      expect(verifyMetaSignedRequestRaw('sig.badpayload', 'secret')).toEqual({
        ok: false,
        reason: 'Invalid webhook signature',
      });
    });
  });

  describe('hybrid-rag', () => {
    it('chunks document content with overlap', () => {
      const doc =
        'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
      const chunks = chunkDocument(doc, 30, 5);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]!.ordinal).toBe(0);
      expect(chunks[0]!.chunk_content.length).toBeGreaterThan(0);
    });

    it('computes deterministic 64-dim embedding and formats pgvector', () => {
      const v1 = computeDeterministicEmbedding64('sample query text');
      expect(v1.length).toBe(64);
      const v2 = computeDeterministicEmbedding64('sample query text');
      expect(v1).toEqual(v2); // deterministic

      const formatted = formatPgVector(v1);
      expect(formatted.startsWith('[')).toBe(true);
      expect(formatted.endsWith(']')).toBe(true);
    });

    it('fuses dense and lexical ranks with RRF (k=60)', () => {
      const dense = new Map([
        ['chunk-1', 1],
        ['chunk-2', 2],
      ]);
      const lexical = new Map([
        ['chunk-2', 1],
        ['chunk-3', 2],
      ]);
      const fusion = fuseRrfScores(dense, lexical, 60);
      expect(fusion.has('chunk-1')).toBe(true);
      expect(fusion.has('chunk-2')).toBe(true);
      expect(fusion.has('chunk-3')).toBe(true);
      // chunk-2 appears in both ranks, so should have highest RRF score
      const score2 = fusion.get('chunk-2')!.rrf;
      const score1 = fusion.get('chunk-1')!.rrf;
      expect(score2).toBeGreaterThan(score1);
    });
  });

  describe('model-routing-policy', () => {
    it('validates fallback pairs', () => {
      expect(isValidFallbackPair('gpt-4o', null)).toBe(true);
      expect(isValidFallbackPair('gpt-4o', 'claude-3-5')).toBe(true);
      expect(isValidFallbackPair('gpt-4o', 'gpt-4o')).toBe(false);
    });
  });

  describe('org-permissions', () => {
    it('enforces RBAC hierarchy and allowed scopes', () => {
      expect(ORG_ROLE_PERMISSIONS.owner).toContain('*');
      expect(ORG_ROLE_PERMISSIONS.admin).toContain('member:manage');
      expect(ORG_ROLE_PERMISSIONS.developer).toContain('prompt:write');
      expect(ORG_ROLE_PERMISSIONS.developer).not.toContain('member:manage');
      expect(ORG_ROLE_PERMISSIONS.viewer).toEqual(['read']);
    });
  });

  describe('prompt-template', () => {
    it('validates template variables and finds issues', () => {
      const t = 'Hello {{name}}, your balance is {{ balance }}.';
      const res = validateTemplate(t);
      expect(res.valid).toBe(true);
      expect(res.variables).toEqual(['balance', 'name']);
      expect(res.issues).toHaveLength(0);

      const invalid = 'Hello {{name broken';
      const invRes = validateTemplate(invalid);
      expect(invRes.valid).toBe(false);
      expect(invRes.issues.length).toBeGreaterThan(0);
    });

    it('computes line diff safely', () => {
      const before = 'line 1\nline 2\nline 3';
      const after = 'line 1\nline 2 modified\nline 3';
      const diff = lineDiff(before, after);
      expect(diff.before_line_count).toBe(3);
      expect(diff.after_line_count).toBe(3);
      expect(diff.changes.length).toBe(1);
      expect(diff.changes[0]!.line).toBe(2);
    });

    it('renders template variables accurately', () => {
      const rendered = renderTemplateVariables('Hello {{name}}!', {
        name: 'Alice',
      });
      expect(rendered).toBe('Hello Alice!');
    });
  });

  describe('redaction (OTel telemetry)', () => {
    it('filters out sensitive attributes and preserves allowlisted ones', () => {
      const attrs = {
        release_id: 'rel_123',
        environment: 'production',
        user_email: 'secret@domain.com', // forbidden
        raw_prompt: 'sensitive text', // forbidden
        step: 1,
      };
      const safe = safeAttributes(attrs);
      expect(safe.release_id).toBe('rel_123');
      expect(safe.environment).toBe('production');
      expect(safe.step).toBe(1);
      expect((safe as any).user_email).toBeUndefined();
      expect((safe as any).raw_prompt).toBeUndefined();
    });

    it('computes nanoDurationMs and validates bounds', () => {
      const start = '1000000000';
      const end = '1500000000';
      expect(nanoDurationMs(start, end)).toBe(500);
      expect(() => nanoDurationMs('200', '100')).toThrow(RangeError);
    });
  });
});
