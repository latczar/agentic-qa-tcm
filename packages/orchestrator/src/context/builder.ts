import type { FrameworkManifest } from '@aiqa/framework-manifest';
import type { ContextReceipt, TestCase } from '../domain/types.js';
import type { ChatMessage } from '../llm/provider.js';
import { estimateTokens } from './budget.js';
import type { FrameworkClient } from './framework-client.js';
import { render, type PromptTemplates } from './prompts.js';

export interface BuiltContext {
  messages: ChatMessage[];
  receipt: ContextReceipt;
}

interface PageObjectSummary {
  name: string;
  via: string | null;
  description: string;
  methods: Array<{ signature: string; kind: string; description: string; inheritedFrom?: string }>;
  locators: Array<{ name: string; testId: string | null }>;
}

/** Which page objects each feature usually needs. Keyword overlap with the steps adds more. */
const FEATURE_PAGES: Record<string, string[]> = {
  auth: ['LoginPage', 'DashboardPage'],
  leave: ['LeavePage', 'LeaveFormPage', 'DashboardPage'],
  expenses: ['ExpensesPage', 'ExpenseFormPage'],
  approvals: ['ApprovalsPage', 'ExpensesPage', 'LeavePage'],
  employees: ['EmployeesPage', 'EmployeeFormPage', 'EmployeeDetailPage'],
};
const ALWAYS = ['LoginPage'];

/**
 * Curated context: the orchestrator decides what the model sees and stays inside a token budget.
 * Truncation order when over budget: drop the second example, then drop the lowest-ranked page
 * objects. The test case, conventions and fixtures are never dropped.
 */
export class ContextBuilder {
  constructor(
    private readonly framework: FrameworkClient,
    private readonly manifest: FrameworkManifest,
    private readonly prompts: PromptTemplates,
    private readonly tokenBudget: number,
  ) {}

  async build(testCase: TestCase): Promise<BuiltContext> {
    const conventions = await this.framework.callText('get_conventions');
    const fixtures = await this.framework.callText('list_fixtures');

    const ranked = this.rankPageObjects(testCase);
    const pageObjects: Array<{ name: string; text: string }> = [];
    for (const name of ranked) {
      const summary = await this.framework.callJson<PageObjectSummary>('get_page_object', { name });
      pageObjects.push({ name, text: formatPageObject(summary) });
    }

    const examples: Array<{ path: string; text: string }> = [];
    const exampleFiles = this.manifest.examples
      .filter((e) => e.feature === testCase.feature)
      .slice(0, 2);
    for (const example of exampleFiles) {
      const source = await this.framework.callText('get_example', { path: example.path });
      examples.push({ path: example.path, text: `// ${example.path}\n${source}` });
    }

    const fixed = {
      testCase: formatTestCase(testCase),
      conventions,
      fixtures,
    };
    const fixedTokens = estimateTokens(Object.values(fixed).join('\n'));
    const dropped: string[] = [];

    const fits = () =>
      fixedTokens +
        estimateTokens(pageObjects.map((p) => p.text).join('\n')) +
        estimateTokens(examples.map((e) => e.text).join('\n')) <=
      this.tokenBudget;

    while (!fits() && examples.length > 1) dropped.push(`example:${examples.pop()?.path}`);
    while (!fits() && pageObjects.length > 1) dropped.push(`pageObject:${pageObjects.pop()?.name}`);

    const values = {
      testCaseId: testCase.id,
      title: testCase.title,
      feature: testCase.feature,
      priority: testCase.priority,
      preconditions: testCase.preconditions || 'None',
      steps: testCase.steps
        .map((s, i) => `${i + 1}. ${s.action}\n   Expected: ${s.expected}`)
        .join('\n'),
      testData: Object.keys(testCase.testData).length
        ? JSON.stringify(testCase.testData, null, 2)
        : 'None',
      conventions,
      testModuleImport: `../../${this.manifest.testModule.replace(/\.ts$/, '.js')}`,
      fixtures,
      pageObjects: pageObjects.map((p) => p.text).join('\n\n'),
      examples: examples.length
        ? examples.map((e) => `\`\`\`ts\n${e.text}\n\`\`\``).join('\n\n')
        : 'None available.',
    };
    const user = render(this.prompts.generate, values);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.prompts.system },
      { role: 'user', content: user },
    ];

    const receipt: ContextReceipt = {
      mode: 'curated',
      tokenBudget: this.tokenBudget,
      estimatedTokens: estimateTokens(messages.map((m) => m.content).join('\n')),
      sections: [
        { name: 'testCase', items: [testCase.id], estimatedTokens: estimateTokens(fixed.testCase) },
        {
          name: 'conventions',
          items: [this.manifest.conventionsFile],
          estimatedTokens: estimateTokens(conventions),
        },
        {
          name: 'fixtures',
          items: this.manifest.fixtures.map((f) => f.name),
          estimatedTokens: estimateTokens(fixtures),
        },
        {
          name: 'pageObjects',
          items: pageObjects.map((p) => p.name),
          estimatedTokens: estimateTokens(pageObjects.map((p) => p.text).join('\n')),
        },
        {
          name: 'examples',
          items: examples.map((e) => e.path),
          estimatedTokens: estimateTokens(examples.map((e) => e.text).join('\n')),
        },
      ],
      dropped,
    };
    return { messages, receipt };
  }

  /** Feature defaults first, then any other page object whose name shares a word with the steps. */
  rankPageObjects(testCase: TestCase): string[] {
    const available = new Set(
      this.manifest.pageObjects.filter((p) => p.appField).map((p) => p.name),
    );
    const ordered: string[] = [];
    const push = (name: string) => {
      if (available.has(name) && !ordered.includes(name)) ordered.push(name);
    };
    ALWAYS.forEach(push);
    (FEATURE_PAGES[testCase.feature] ?? []).forEach(push);

    const words = new Set(
      `${testCase.title} ${testCase.steps.map((s) => `${s.action} ${s.expected}`).join(' ')}`
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4),
    );
    for (const name of available) {
      const stem = name
        .replace(/Page$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(' ');
      if (stem.some((w) => words.has(w) || words.has(`${w}s`))) push(name);
    }
    if (words.has('403') || words.has('error') || words.has('forbidden')) push('ErrorPage');
    return ordered;
  }
}

function formatTestCase(t: TestCase): string {
  return [
    `${t.id}: ${t.title}`,
    t.preconditions,
    ...t.steps.map((s, i) => `${i + 1}. ${s.action} -> ${s.expected}`),
    JSON.stringify(t.testData),
  ].join('\n');
}

function formatPageObject(p: PageObjectSummary): string {
  const lines = [`## ${p.name}${p.via ? ` (${p.via})` : ''}`, p.description];
  lines.push('Methods:');
  for (const m of p.methods) {
    lines.push(`- ${m.signature}  [${m.kind}] ${m.description}`.trimEnd());
  }
  const testIds = p.locators.filter((l) => l.testId).map((l) => `${l.name} (${l.testId})`);
  if (testIds.length) lines.push(`Locators: ${testIds.join(', ')}`);
  return lines.join('\n');
}
