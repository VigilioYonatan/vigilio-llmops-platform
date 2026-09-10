export interface TemplateValidation {
  valid: boolean;
  variables: string[];
  issues: string[];
}

/** Recognizes only double-brace variables; literal braces are not executable expressions. */
export function validateTemplate(template: string): TemplateValidation {
  const matches = [
    ...template.matchAll(/{{\s*([a-zA-Z_][a-zA-Z0-9_.]{0,79})\s*}}/g),
  ];
  const variables = [...new Set(matches.map((m) => m[1]!))].sort();
  const leftovers = template.replace(
    /{{\s*[a-zA-Z_][a-zA-Z0-9_.]{0,79}\s*}}/g,
    '',
  );
  const issues: string[] = [];
  if (leftovers.includes('{{') || leftovers.includes('}}')) {
    issues.push('Unbalanced or unsupported template markers');
  }
  if (template.length > 50000) {
    issues.push('Template exceeds limit');
  }
  return { valid: issues.length === 0, variables, issues };
}

/** A deterministic line diff, bounded to avoid unbounded UI payloads. */
export function lineDiff(before: string, after: string) {
  const a = before.split('\n').slice(0, 800);
  const b = after.split('\n').slice(0, 800);
  return {
    before_line_count: a.length,
    after_line_count: b.length,
    changes: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({
      line: i + 1,
      before: a[i] ?? null,
      after: b[i] ?? null,
    }))
      .filter((x) => x.before !== x.after)
      .slice(0, 250),
  };
}

export function renderTemplateVariables(
  template: string,
  variables?: Record<string, string>,
): string {
  if (!variables) return template;
  let rendered = template;
  for (const [key, val] of Object.entries(variables)) {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    rendered = rendered.replace(re, val);
  }
  return rendered;
}
