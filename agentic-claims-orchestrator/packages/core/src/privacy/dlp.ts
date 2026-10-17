/**
 * Lightweight DLP scanner. It is a defense-in-depth control: PII is tokenized at the edges
 * (FNOL submission, document_extract tool) so these patterns should never match on egress.
 * When they do, the hit is redacted AND reported as a policy violation.
 */
export type PiiKind = 'email' | 'phone' | 'ssn' | 'card' | 'name' | 'document';

const PATTERNS: { kind: Exclude<PiiKind, 'name' | 'document'>; re: RegExp }[] = [
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'card', re: /(?<![.\d])\b(?:\d[ -]?){13,19}\b/g },
  { kind: 'phone', re: /(?:\+?\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g },
];

export interface DlpFinding {
  kind: PiiKind;
  start: number;
  end: number;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function scanPii(text: string, knownValues: readonly string[] = []): DlpFinding[] {
  const findings: DlpFinding[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (kind === 'card') {
        const digits = m[0].replace(/\D/g, '');
        if (digits.length < 13 || !luhnValid(digits)) continue;
      }
      findings.push({ kind, start: m.index, end: m.index + m[0].length });
    }
  }
  for (const value of knownValues) {
    if (value.length < 3) continue;
    let idx = text.toLowerCase().indexOf(value.toLowerCase());
    while (idx >= 0) {
      findings.push({ kind: 'name', start: idx, end: idx + value.length });
      idx = text.toLowerCase().indexOf(value.toLowerCase(), idx + value.length);
    }
  }
  // Drop overlaps, keep the earliest/longest match.
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: DlpFinding[] = [];
  let lastEnd = -1;
  for (const f of findings) {
    if (f.start >= lastEnd) {
      out.push(f);
      lastEnd = f.end;
    }
  }
  return out;
}

/** Replaces findings using `replacer` (e.g. a vault token or a static mask). */
export async function redactPii(
  text: string,
  replacer: (kind: PiiKind, value: string) => Promise<string> | string,
  knownValues: readonly string[] = [],
): Promise<{ text: string; findings: DlpFinding[] }> {
  const findings = scanPii(text, knownValues);
  if (findings.length === 0) return { text, findings };
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.start) + (await replacer(f.kind, text.slice(f.start, f.end)));
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { text: out, findings };
}

export const maskReplacer = (kind: PiiKind): string => `[REDACTED:${kind.toUpperCase()}]`;
