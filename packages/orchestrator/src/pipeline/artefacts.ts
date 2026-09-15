import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContextReceipt, GateReport, GenerationRun } from '../domain/types.js';
import type { ChatMessage } from '../llm/provider.js';

/**
 * Everything a human needs to understand an attempt, on disk:
 * artifacts/runs/<runId>/attempt-<n>/{prompt.md, response.txt, candidate.spec.ts, gates.json, receipt.json}
 * plus RUN.md at the run level. Git-ignored locally, uploaded in CI.
 */
export interface ArtefactStore {
  attempt(
    runId: string,
    attemptNo: number,
    files: {
      messages: ChatMessage[];
      response: string | null;
      code: string | null;
      report: GateReport | null;
      receipt: ContextReceipt;
    },
  ): Promise<string>;
  summary(run: GenerationRun, text: string): Promise<void>;
}

export class FileArtefactStore implements ArtefactStore {
  constructor(private readonly rootDir: string) {}

  async attempt(runId: string, attemptNo: number, files: Parameters<ArtefactStore['attempt']>[2]) {
    const dir = path.join(this.rootDir, runId, `attempt-${attemptNo}`);
    await mkdir(dir, { recursive: true });
    const prompt = files.messages.map((m) => `## ${m.role}\n\n${m.content}`).join('\n\n---\n\n');
    await writeFile(path.join(dir, 'prompt.md'), prompt, 'utf8');
    await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(files.receipt, null, 2), 'utf8');
    if (files.response !== null)
      await writeFile(path.join(dir, 'response.txt'), files.response, 'utf8');
    if (files.code !== null)
      await writeFile(path.join(dir, 'candidate.spec.ts'), files.code, 'utf8');
    if (files.report)
      await writeFile(path.join(dir, 'gates.json'), JSON.stringify(files.report, null, 2), 'utf8');
    return dir;
  }

  async summary(run: GenerationRun, text: string): Promise<void> {
    const dir = path.join(this.rootDir, run.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'RUN.md'), text, 'utf8');
  }
}

export class NullArtefactStore implements ArtefactStore {
  async attempt(): Promise<string> {
    return '';
  }
  async summary(): Promise<void> {}
}
