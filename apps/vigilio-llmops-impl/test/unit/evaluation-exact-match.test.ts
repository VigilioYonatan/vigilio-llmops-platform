import { describe, expect, it } from 'vitest';
import {
  normalizedExactMatch,
  qualityGate,
  renderPrompt,
} from '../../src/modules/evaluations/domain/exact-match';

describe('deterministic evaluation domain', () => {
  it('normalizes unicode NFKC', () =>
    expect(normalizedExactMatch('Ｃａｔ', 'cat')).toBe(true));
  it('normalizes whitespace and case', () =>
    expect(normalizedExactMatch('  A   B\nC ', 'a b c')).toBe(true));
  it('does not accept hallucinated extra text', () =>
    expect(normalizedExactMatch('approved because yes', 'approved')).toBe(
      false,
    ));
  it('rejects different semantic content', () =>
    expect(normalizedExactMatch('12 days', '20 days')).toBe(false));
  it('replaces all occurrences without interpolating expected output', () =>
    expect(renderPrompt('Q: {{input}}; repeat: {{input}}', 'hello')).toBe(
      'Q: hello; repeat: hello',
    ));
  it('preserves literal template when no placeholder exists', () =>
    expect(renderPrompt('Hello world', 'irrelevant')).toBe('Hello world'));
  it('passes an exact threshold with no critical failures', () =>
    expect(qualityGate(0.9, 0.9, 0)).toBe(true));
  it('rejects score regressions', () =>
    expect(qualityGate(0.899, 0.9, 0)).toBe(false));
  it('rejects critical safety failures even with perfect score', () =>
    expect(qualityGate(1, 0.9, 1)).toBe(false));
  it('rejects NaN scores', () =>
    expect(qualityGate(Number.NaN, 0.9, 0)).toBe(false));
});
