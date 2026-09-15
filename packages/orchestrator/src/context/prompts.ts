import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PromptTemplates {
  version: string;
  system: string;
  generate: string;
  retry: string;
  repair: string;
}

/** Loads prompts/<version>/*.md. Prompts are versioned files, not strings in code, so changes are reviewable. */
export async function loadPrompts(promptsDir: string, version: string): Promise<PromptTemplates> {
  const dir = path.join(promptsDir, version);
  const read = (name: string) => readFile(path.join(dir, `${name}.md`), 'utf8');
  const [system, generate, retry, repair] = await Promise.all([
    read('system'),
    read('generate'),
    read('retry'),
    read('repair'),
  ]);
  return { version, system, generate, retry, repair };
}

/** Replaces {{name}} placeholders. Unknown placeholders are left visible so they get noticed. */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}
