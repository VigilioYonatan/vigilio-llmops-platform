export function canApprove(
  creator_id: string,
  approver_id: string,
  mfa_time: Date | null,
  now = Date.now(),
): boolean {
  if (creator_id === approver_id) return false;
  return (
    mfa_time !== null &&
    Number.isFinite(new Date(mfa_time).getTime()) &&
    now - new Date(mfa_time).getTime() <= 5 * 60_000
  );
}

export function isPromotionEligible(
  score: number,
  minimum: number,
  run_status: string,
): boolean {
  return (
    ['passed', 'failed'].includes(run_status) &&
    Number.isFinite(score) &&
    score >= minimum &&
    score <= 1 &&
    minimum >= 0
  );
}
