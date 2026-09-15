import path from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type JSDocableNode,
  type ParameterDeclaration,
  type SourceFile,
} from 'ts-morph';
import type {
  ExampleInfo,
  FixtureInfo,
  FrameworkManifest,
  HelperInfo,
  LocatorInfo,
  MethodInfo,
  MethodKind,
  PageObjectInfo,
  ParamInfo,
  SeedUserInfo,
  SeededInfo,
} from './types.js';

export interface ExtractOptions {
  /** Absolute path to packages/e2e-framework. */
  frameworkRoot: string;
  /** Label written into the manifest, for example "packages/e2e-framework". */
  frameworkLabel?: string;
}

/**
 * Parses the framework with the TypeScript compiler (through ts-morph) and returns the manifest.
 * Pure function of the source tree: same code in, same manifest out, which is what the drift
 * check in CI relies on.
 */
export function extractManifest(options: ExtractOptions): FrameworkManifest {
  const root = path.resolve(options.frameworkRoot);
  const project = new Project({ tsConfigFilePath: path.join(root, 'tsconfig.json') });
  const rel = (file: SourceFile) => toPosix(path.relative(root, file.getFilePath()));

  const pagesIndex = mustGet(project, root, 'src/pages/index.ts');
  const appClass = pagesIndex.getClassOrThrow('App');
  const app = appClass
    .getProperties()
    .map((p) => ({ field: p.getName(), className: p.getTypeNode()?.getText() ?? '' }))
    .sort((a, b) => a.field.localeCompare(b.field));
  const appFieldByClass = new Map(app.map((a) => [a.className, a.field]));

  const pageObjects = project
    .getSourceFiles()
    .filter((f) => /^src\/pages\/.+\.page\.ts$/.test(rel(f)))
    .flatMap((f) => f.getClasses().map((cls) => extractPageObject(cls, rel(f), appFieldByClass)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const testModule = 'src/fixtures/test.ts';
  const fixtures = extractFixtures(mustGet(project, root, testModule));
  const usersFile = mustGet(project, root, 'src/fixtures/users.ts');
  const users = extractUsers(usersFile);
  const seeded = extractSeeded(usersFile);
  const helpers = extractHelpers(
    mustGet(project, root, 'src/fixtures/dates.ts'),
    'src/fixtures/dates.ts',
  );

  const examples = project
    .getSourceFiles()
    .filter((f) => /^tests\/e2e\/.+\.spec\.ts$/.test(rel(f)))
    .map((f) => extractExample(f, rel(f)))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: 1,
    frameworkRoot: options.frameworkLabel ?? toPosix(path.relative(process.cwd(), root)),
    testModule,
    conventionsFile: 'CONVENTIONS.md',
    app,
    pageObjects,
    fixtures,
    users,
    seeded,
    helpers,
    examples,
  };
}

function extractPageObject(
  cls: ClassDeclaration,
  file: string,
  appFieldByClass: Map<string, string>,
): PageObjectInfo {
  const name = cls.getNameOrThrow();
  const chain = [cls, ...baseClasses(cls)];
  const locators: LocatorInfo[] = [];
  const methods: MethodInfo[] = [];
  const seen = new Set<string>();

  for (const c of chain) {
    const inheritedFrom = c === cls ? null : c.getNameOrThrow();
    const assigned = constructorAssignments(c);
    for (const prop of c.getProperties()) {
      if (!isPublic(prop) || seen.has(prop.getName())) continue;
      if ((prop.getTypeNode()?.getText() ?? '') !== 'Locator') continue;
      seen.add(prop.getName());
      const expression = (assigned.get(prop.getName()) ?? prop.getInitializer()?.getText() ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      locators.push({
        name: prop.getName(),
        testId: /getByTestId\(['"`]([^'"`]+)['"`]\)\s*$/.exec(expression)?.[1] ?? null,
        expression,
        description: jsDoc(prop),
        inheritedFrom,
      });
    }
    for (const m of c.getMethods()) {
      if (!isPublic(m) || m.isStatic() || seen.has(m.getName())) continue;
      seen.add(m.getName());
      const returns = m.getReturnTypeNode()?.getText() ?? m.getReturnType().getText(m);
      methods.push({
        name: m.getName(),
        description: jsDoc(m),
        params: m.getParameters().map(param),
        returns,
        kind: kindOf(m.getName(), returns),
        inheritedFrom,
      });
    }
  }

  return {
    name,
    file,
    description: jsDoc(cls),
    extends: cls.getBaseClass()?.getName() ?? null,
    appField: appFieldByClass.get(name) ?? null,
    locators,
    methods,
  };
}

function extractFixtures(file: SourceFile): FixtureInfo[] {
  const iface = file.getInterfaceOrThrow('Fixtures');
  return iface.getProperties().map((p) => ({
    name: p.getName(),
    type: p.getTypeNode()?.getText().replace(/\s+/g, ' ') ?? '',
    description: jsDoc(p),
  }));
}

function extractUsers(file: SourceFile): SeedUserInfo[] {
  const init = file.getVariableDeclarationOrThrow('users').getInitializerOrThrow();
  const literal = init.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  return literal.getProperties().flatMap((p) => {
    if (!Node.isPropertyAssignment(p)) return [];
    const args = /seedUser\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\)/.exec(
      p.getInitializerOrThrow().getText(),
    );
    if (!args) return [];
    return [
      {
        key: p.getName(),
        id: args[1] ?? '',
        firstName: args[2] ?? '',
        lastName: args[3] ?? '',
        role: args[4] ?? '',
        description: leadingDoc(p),
      },
    ];
  });
}

function extractSeeded(file: SourceFile): SeededInfo[] {
  const init = file.getVariableDeclarationOrThrow('seeded').getInitializerOrThrow();
  const literal = init.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  return literal.getProperties().flatMap((p) =>
    Node.isPropertyAssignment(p)
      ? [
          {
            key: p.getName(),
            value: p.getInitializerOrThrow().getText(),
            description: leadingDoc(p),
          },
        ]
      : [],
  );
}

function extractHelpers(file: SourceFile, relPath: string): HelperInfo[] {
  return file
    .getFunctions()
    .filter((f) => f.isExported())
    .map((f) => ({
      name: f.getNameOrThrow(),
      file: relPath,
      params: f.getParameters().map(param),
      returns: f.getReturnTypeNode()?.getText() ?? f.getReturnType().getText(f),
      description: jsDoc(f),
    }));
}

function extractExample(file: SourceFile, relPath: string): ExampleInfo {
  let describe: string | null = null;
  const tests: ExampleInfo['tests'] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    const [first, second] = call.getArguments();
    if (!first || !Node.isStringLiteral(first)) continue;
    if (callee === 'test.describe' && describe === null) describe = first.getLiteralValue();
    if (callee === 'test') {
      const tags: string[] = [];
      if (second && Node.isObjectLiteralExpression(second)) {
        const tag = second.getProperty('tag');
        if (tag && Node.isPropertyAssignment(tag)) {
          const value = tag.getInitializerOrThrow();
          if (Node.isStringLiteral(value)) tags.push(value.getLiteralValue());
          if (Node.isArrayLiteralExpression(value)) {
            for (const el of value.getElements()) {
              if (Node.isStringLiteral(el)) tags.push(el.getLiteralValue());
            }
          }
        }
      }
      tests.push({ title: first.getLiteralValue(), tags });
    }
  }
  const feature = relPath.split('/')[2] ?? 'unknown';
  return { path: relPath, feature, describe, tests };
}

// Helpers

function baseClasses(cls: ClassDeclaration): ClassDeclaration[] {
  const out: ClassDeclaration[] = [];
  let current = cls.getBaseClass();
  while (current) {
    out.push(current);
    current = current.getBaseClass();
  }
  return out;
}

/** `this.x = <expr>` statements in the constructor, keyed by field name. */
function constructorAssignments(cls: ClassDeclaration): Map<string, string> {
  const map = new Map<string, string>();
  const ctor = cls.getConstructors()[0];
  for (const be of ctor?.getBody()?.getDescendantsOfKind(SyntaxKind.BinaryExpression) ?? []) {
    if (be.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    const left = be.getLeft().getText();
    if (left.startsWith('this.')) map.set(left.slice('this.'.length), be.getRight().getText());
  }
  return map;
}

function isPublic(node: {
  hasModifier(kind: SyntaxKind.PrivateKeyword | SyntaxKind.ProtectedKeyword): boolean;
}): boolean {
  return (
    !node.hasModifier(SyntaxKind.PrivateKeyword) && !node.hasModifier(SyntaxKind.ProtectedKeyword)
  );
}

function param(p: ParameterDeclaration): ParamInfo {
  return {
    name: p.getName(),
    type: (p.getTypeNode()?.getText() ?? p.getType().getText(p)).replace(/\s+/g, ' '),
    optional: p.isOptional(),
  };
}

function kindOf(name: string, returns: string): MethodKind {
  if (/^goto/.test(name)) return 'navigation';
  if (/^expect[A-Z]/.test(name)) return 'assertion';
  if (returns === 'Locator') return 'locator';
  return 'action';
}

function jsDoc(node: JSDocableNode): string {
  return node
    .getJsDocs()
    .map((d) => d.getDescription().trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

function mustGet(project: Project, root: string, relPath: string): SourceFile {
  const file = project.getSourceFile(path.join(root, relPath));
  if (!file) throw new Error(`Framework file not found: ${relPath} (looked under ${root})`);
  return file;
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * JSDoc-style comment above nodes ts-morph does not treat as JSDoc-bearing,
 * such as properties of an object literal.
 */
function leadingDoc(node: Node): string {
  return node
    .getLeadingCommentRanges()
    .map((r) => r.getText())
    .filter((t) => t.startsWith('/**'))
    .map((t) =>
      t
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .join(' ')
        .trim(),
    )
    .join(' ')
    .replace(/\s+/g, ' ');
}
