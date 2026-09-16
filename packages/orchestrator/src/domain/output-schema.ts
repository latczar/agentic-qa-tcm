import { z } from 'zod';

/**
 * The contract the model must meet. The pipeline never accepts bare code.
 * The used* lists are the model's self-report; gate G2 compares them with what the code really uses.
 */
export const GeneratedTestSchema = z.object({
  testCaseId: z.string().regex(/^TC-\d{3,}$/, 'testCaseId must look like TC-014'),
  /** Any string; the pipeline normalises it onto the run's test case id anyway. */
  fileName: z.string().min(1),
  title: z.string().min(1, 'title is required'),
  usedPageObjects: z.array(z.string()).default([]),
  usedMethods: z.array(z.string()).default([]),
  usedFixtures: z.array(z.string()).default([]),
  code: z.string().min(50, 'code must be the complete test file'),
  assumptions: z.array(z.string()).default([]),
  /** Informational. Out-of-range values are clamped rather than rejected. */
  confidence: z
    .number()
    .catch(0.5)
    .transform((n) => Math.min(1, Math.max(0, n))),
});

export type GeneratedTest = z.infer<typeof GeneratedTestSchema>;

/**
 * Two wire formats, one contract.
 * json:   a single JSON object with the whole file escaped inside "code". Precise, but small models
 *         mangle long escaped strings.
 * fenced: a ```ts block with the file, followed by a ```json block with the metadata. Natural for
 *         coder models. Metadata may be partial; the test case id can be read from the tag in the code.
 * Each prompt version declares which one it asks for.
 */
export type ResponseFormat = 'json' | 'fenced';

export function parseGeneratedTest(
  raw: string,
): { ok: true; value: GeneratedTest } | { ok: false; problems: string[] } {
  const fenced = parseFenced(raw);
  const candidate = fenced ?? extractJsonObject(raw);
  if (candidate === null) {
    return {
      ok: false,
      problems: ['No ```ts code block and no JSON object found in the response.'],
    };
  }
  let parsed: unknown = candidate;
  if (typeof candidate === 'string') {
    try {
      parsed = JSON.parse(candidate);
    } catch (error) {
      return { ok: false, problems: [`Invalid JSON: ${(error as Error).message}`] };
    }
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

/** ```ts file ``` plus optional ```json metadata ```. Returns an object ready for the schema, or null. */
function parseFenced(raw: string): Record<string, unknown> | null {
  const ts = /```(?:ts|typescript)\s*\n([\s\S]*?)```/.exec(raw);
  if (!ts) return null;
  const code = (ts[1] ?? '').trim();
  let meta: Record<string, unknown> = {};
  const json = /```json\s*\n([\s\S]*?)```/.exec(raw);
  if (json) {
    try {
      const value: unknown = JSON.parse(json[1] ?? '');
      if (typeof value === 'object' && value !== null) meta = value as Record<string, unknown>;
    } catch {
      // Metadata is a courtesy; a broken metadata block does not sink a good test.
    }
  }
  const tag = /@(TC-\d{3,})/.exec(code)?.[1];
  const title = /test\(\s*(['"`])(.+?)\1/.exec(code)?.[2];
  return {
    testCaseId: meta.testCaseId ?? tag ?? '',
    fileName: meta.fileName ?? (tag ? `${tag.toLowerCase()}-generated.spec.ts` : ''),
    title: meta.title ?? title ?? '',
    usedPageObjects: meta.usedPageObjects ?? [],
    usedMethods: meta.usedMethods ?? [],
    usedFixtures: meta.usedFixtures ?? [],
    code,
    assumptions: meta.assumptions ?? [],
    confidence: meta.confidence ?? 0.5,
  };
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

/**
 * The json contract as the plain JSON Schema subset Ollama's constrained decoding handles: typed
 * properties and a required list, no patterns, defaults or bounds. Only used with the json format.
 */
export const OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    testCaseId: { type: 'string' },
    fileName: { type: 'string' },
    title: { type: 'string' },
    usedPageObjects: { type: 'array', items: { type: 'string' } },
    usedMethods: { type: 'array', items: { type: 'string' } },
    usedFixtures: { type: 'array', items: { type: 'string' } },
    code: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['testCaseId', 'fileName', 'title', 'usedMethods', 'code'],
};
