import { z } from 'zod';

/**
 * The contract the model must meet. The pipeline never accepts bare code.
 * The used* lists are the model's self-report; gate G2 compares them with what the code really uses.
 */
export const GeneratedTestSchema = z.object({
  testCaseId: z.string().regex(/^TC-\d{3,}$/, 'testCaseId must look like TC-014'),
  fileName: z
    .string()
    .regex(/^tc-\d{3,}-[a-z0-9-]+\.spec\.ts$/, 'fileName must look like tc-014-short-slug.spec.ts'),
  title: z.string().min(10, 'title must be a full sentence'),
  usedPageObjects: z.array(z.string()).default([]),
  usedMethods: z.array(z.string()).default([]),
  usedFixtures: z.array(z.string()).default([]),
  code: z.string().min(50, 'code must be the complete test file'),
  assumptions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type GeneratedTest = z.infer<typeof GeneratedTestSchema>;

/**
 * Tolerates the ways small models wrap JSON: code fences, prose before or after.
 * Returns the parsed object or a list of human-readable problems.
 */
export function parseGeneratedTest(
  raw: string,
): { ok: true; value: GeneratedTest } | { ok: false; problems: string[] } {
  const candidate = extractJsonObject(raw);
  if (candidate === null) {
    return { ok: false, problems: ['No JSON object found in the response.'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return { ok: false, problems: [`Invalid JSON: ${(error as Error).message}`] };
  }
  const result = GeneratedTestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, value: result.data };
}

function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced?.[1]?.trim() ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}
