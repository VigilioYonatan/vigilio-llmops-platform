import { describe, expect, it } from 'vitest';
import {
  canApprove,
  isPromotionEligible,
} from '../../src/modules/releases/domain/release-policy';

describe('release governance', () => {
  it('prevents self-approval', () =>
    expect(canApprove('same', 'same', new Date())).toBe(false));
  it('requires recently verified MFA', () =>
    expect(canApprove('a', 'b', null)).toBe(false));
  it('rejects stale MFA', () =>
    expect(canApprove('a', 'b', new Date(Date.now() - 600000))).toBe(false));
  it('accepts independent recent MFA', () =>
    expect(canApprove('a', 'b', new Date(Date.now() - 5000))).toBe(true));
  it('blocks in-progress evaluation', () =>
    expect(isPromotionEligible(1, 0.9, 'running')).toBe(false));
  it('blocks evaluation below quality gate', () =>
    expect(isPromotionEligible(0.75, 0.9, 'failed')).toBe(false));
  it('allows partial but above-threshold deterministic score', () =>
    expect(isPromotionEligible(0.95, 0.9, 'failed')).toBe(true));
  it('requires finite score', () =>
    expect(isPromotionEligible(Number.NaN, 0.9, 'passed')).toBe(false));
});
