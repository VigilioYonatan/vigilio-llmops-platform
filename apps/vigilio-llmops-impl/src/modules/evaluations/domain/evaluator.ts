/** Deterministic evaluation only; not an LLM-as-a-judge calibration claim. */
export function evaluateDeterministic(
  kind: 'exact_match' | 'contains' | 'regex',
  expected: string,
  actual: string,
): boolean {
  const normalized = (v: string) =>
    v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  if (kind === 'exact_match')
    return normalized(expected) === normalized(actual);
  if (kind === 'contains')
    return normalized(actual).includes(normalized(expected));
  // Avoid arbitrary user-supplied regex against unbounded text: only anchored literal regular expressions.
  if (expected.length > 200 || actual.length > 10000) return false;
  if (!/^\^[a-zA-Z0-9 .,!?_-]{1,180}\$$/.test(expected)) return false;
  try {
    return new RegExp(expected, 'i').test(actual);
  } catch {
    return false;
  }
}

export function calibrationAgreement(
  kind: 'exact_match' | 'contains' | 'regex',
  labels: Array<{ expected: string; actual: string; human_passed: boolean }>,
) {
  if (!labels.length) throw new Error('Calibration requires labelled cases');
  const agreed = labels.filter(
    (x) => evaluateDeterministic(kind, x.expected, x.actual) === x.human_passed,
  ).length;
  return { total: labels.length, agreed, agreement: agreed / labels.length };
}
