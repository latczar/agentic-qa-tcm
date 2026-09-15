import type { GateReport } from '../domain/types.js';

/**
 * Turns a gate report into the text the model sees on retry: one line per problem with its code,
 * line and message, then the distinct hints. Structured and short on purpose; never a raw log.
 */
export function feedbackFrom(report: GateReport): { gate: string; errors: string; hints: string } {
  const failed = report.results.find((r) => !r.passed);
  if (!failed) return { gate: 'none', errors: 'No problems recorded.', hints: '' };
  const errors = failed.errors
    .slice(0, 12)
    .map((e) => `- [${e.code}]${e.line ? ` line ${e.line}:` : ''} ${e.message}`)
    .join('\n');
  const hints = [
    ...new Set(failed.errors.map((e) => e.hint).filter((h): h is string => Boolean(h))),
  ]
    .slice(0, 8)
    .map((h) => `- ${h}`)
    .join('\n');
  return {
    gate: `${failed.gate} ${failed.name}`,
    errors: errors || `- ${failed.name} failed without details.`,
    hints: hints ? `How to fix:\n${hints}` : '',
  };
}
