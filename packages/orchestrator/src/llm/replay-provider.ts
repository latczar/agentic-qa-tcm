import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompletionRequest, CompletionResponse, LlmProvider } from './provider.js';

export interface Scenario {
  name: string;
  description: string;
  testCaseId: string;
  /** One response per attempt, in order. The last one repeats if more attempts happen. */
  responses: string[];
  expect: {
    finalStatus: string;
    attempts: number;
    failureClasses: string[];
    tcmStatus: string;
  };
}

/**
 * Serves canned model responses from a scenario folder, so the whole pipeline, including every
 * failure path, runs deterministically with no model present. This is what CI uses.
 *
 * scenarios/<name>/scenario.json  metadata and expectations
 * scenarios/<name>/response-1.txt response for attempt 1, response-2.txt for attempt 2, ...
 */
export class ReplayProvider implements LlmProvider {
  readonly name = 'replay';
  readonly supportsTools = false;
  readonly model: string;
  private served = 0;

  constructor(private readonly scenario: Scenario) {
    this.model = `replay:${scenario.name}`;
  }

  static async load(scenariosDir: string, name: string): Promise<ReplayProvider> {
    const dir = path.join(scenariosDir, name);
    const meta = JSON.parse(await readFile(path.join(dir, 'scenario.json'), 'utf8')) as Omit<
      Scenario,
      'responses' | 'name'
    >;
    const files = (await readdir(dir)).filter((f) => /^response-\d+\.txt$/.test(f)).sort();
    if (files.length === 0) throw new Error(`Scenario ${name} has no response-N.txt files`);
    const responses = await Promise.all(files.map((f) => readFile(path.join(dir, f), 'utf8')));
    return new ReplayProvider({ ...meta, name, responses });
  }

  static async listScenarios(scenariosDir: string): Promise<string[]> {
    const entries = await readdir(scenariosDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  get expectations(): Scenario['expect'] {
    return this.scenario.expect;
  }

  get testCaseId(): string {
    return this.scenario.testCaseId;
  }

  async health(): Promise<void> {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const index = Math.min(
      (request.tag?.attempt ?? this.served + 1) - 1,
      this.scenario.responses.length - 1,
    );
    this.served += 1;
    const text = this.scenario.responses[Math.max(0, index)] ?? '';
    return {
      text,
      model: this.model,
      promptTokens: Math.ceil(request.messages.reduce((n, m) => n + m.content.length, 0) / 4),
      completionTokens: Math.ceil(text.length / 4),
      durationMs: 0,
    };
  }
}
