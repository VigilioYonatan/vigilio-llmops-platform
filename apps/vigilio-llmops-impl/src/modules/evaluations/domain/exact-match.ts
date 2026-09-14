/** Deterministic exact-match evaluator. Deliberately narrow; never pretend this is a semantic LLM judge. */
export function normalizedExactMatch(
  actual: string,
  expected: string,
): boolean {
  const normalize = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  return normalize(actual) === normalize(expected);
}
export function renderPrompt(template: string, input: string): string {
  return template.replaceAll('{{input}}', input);
}
export function qualityGate(
  score: number,
  minimum_score: number,
  critical_failures: number,
): boolean {
  return (
    Number.isFinite(score) &&
    Number.isFinite(minimum_score) &&
    score >= minimum_score &&
    critical_failures === 0
  );
}
