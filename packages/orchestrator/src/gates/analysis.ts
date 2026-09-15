import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph';

/**
 * A structural reading of a candidate spec, produced once and shared by gates G1 and G2.
 * Uses the TypeScript parser in memory; no type checking, so it is fast.
 */
export interface CodeAnalysis {
  imports: Array<{ module: string; names: string[]; line: number }>;
  tests: Array<{ title: string; tags: string[]; fixtures: string[]; line: number }>;
  /** app.<field>.<member> references. */
  appRefs: Array<{ field: string; member: string; isCall: boolean; args: number; line: number }>;
  pageCalls: Array<{ method: string; line: number }>;
  absoluteUrls: Array<{ text: string; line: number }>;
  forbidden: Array<{ what: string; line: number }>;
  userKeys: Array<{ key: string; line: number }>;
  seededKeys: Array<{ key: string; line: number }>;
  /** Free function calls such as addDays(...) or mondayWeeksAhead(...). */
  functionCalls: Array<{ name: string; line: number }>;
}

const FORBIDDEN_IDENTIFIERS = new Set(['require', 'eval', 'process', 'Function', 'globalThis']);
const FORBIDDEN_MEMBERS = new Set(['waitForTimeout']);
const FORBIDDEN_TEST_MODIFIERS = new Set(['only', 'skip', 'fixme']);

export function analyseCode(code: string): CodeAnalysis {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: false } });
  const file = project.createSourceFile('candidate.spec.ts', code);
  return {
    imports: readImports(file),
    tests: readTests(file),
    appRefs: readAppRefs(file),
    pageCalls: readPageCalls(file),
    absoluteUrls: readAbsoluteUrls(file),
    forbidden: readForbidden(file),
    userKeys: readKeys(file, 'users'),
    seededKeys: readKeys(file, 'seeded'),
    functionCalls: readFunctionCalls(file),
  };
}

function readImports(file: SourceFile) {
  return file.getImportDeclarations().map((d) => ({
    module: d.getModuleSpecifierValue(),
    names: [
      ...d.getNamedImports().map((n) => n.getName()),
      ...(d.getDefaultImport() ? [d.getDefaultImport()!.getText()] : []),
      ...(d.getNamespaceImport() ? [`* as ${d.getNamespaceImport()!.getText()}`] : []),
    ],
    line: d.getStartLineNumber(),
  }));
}

function readTests(file: SourceFile) {
  const tests: CodeAnalysis['tests'] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    if (callee !== 'test' && !/^test\.(only|skip|fixme|fail|slow)$/.test(callee)) continue;
    const [title, second, third] = call.getArguments();
    if (!title || !Node.isStringLiteral(title)) continue;
    const tags: string[] = [];
    if (second && Node.isObjectLiteralExpression(second)) {
      const tag = second.getProperty('tag');
      if (tag && Node.isPropertyAssignment(tag)) {
        const value = tag.getInitializer();
        if (value && Node.isStringLiteral(value)) tags.push(value.getLiteralValue());
        if (value && Node.isArrayLiteralExpression(value)) {
          for (const el of value.getElements())
            if (Node.isStringLiteral(el)) tags.push(el.getLiteralValue());
        }
      }
    }
    const fn = [third, second].find(
      (a) => a && (Node.isArrowFunction(a) || Node.isFunctionExpression(a)),
    );
    const fixtures: string[] = [];
    if (fn && (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
      const first = fn.getParameters()[0];
      const binding = first?.getNameNode();
      if (binding && Node.isObjectBindingPattern(binding)) {
        for (const el of binding.getElements())
          fixtures.push((el.getPropertyNameNode() ?? el.getNameNode()).getText());
      }
    }
    tests.push({ title: title.getLiteralValue(), tags, fixtures, line: call.getStartLineNumber() });
  }
  return tests;
}

function readAppRefs(file: SourceFile) {
  const refs: CodeAnalysis['appRefs'] = [];
  for (const pae of file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const inner = pae.getExpression();
    if (!Node.isPropertyAccessExpression(inner)) continue;
    const root = inner.getExpression();
    if (!Node.isIdentifier(root) || root.getText() !== 'app') continue;
    const parent = pae.getParent();
    const isCall = Node.isCallExpression(parent) && parent.getExpression() === pae;
    refs.push({
      field: inner.getName(),
      member: pae.getName(),
      isCall,
      args: isCall ? parent.getArguments().length : 0,
      line: pae.getStartLineNumber(),
    });
  }
  return refs;
}

function readPageCalls(file: SourceFile) {
  const calls: CodeAnalysis['pageCalls'] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const obj = callee.getExpression();
    if (Node.isIdentifier(obj) && obj.getText() === 'page') {
      calls.push({ method: callee.getName(), line: call.getStartLineNumber() });
    }
  }
  return calls;
}

function readAbsoluteUrls(file: SourceFile) {
  const urls: CodeAnalysis['absoluteUrls'] = [];
  const check = (text: string, line: number) => {
    if (/^https?:\/\//i.test(text)) urls.push({ text, line });
  };
  for (const s of file.getDescendantsOfKind(SyntaxKind.StringLiteral))
    check(s.getLiteralValue(), s.getStartLineNumber());
  for (const s of file.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral))
    check(s.getLiteralValue(), s.getStartLineNumber());
  for (const t of file.getDescendantsOfKind(SyntaxKind.TemplateExpression))
    check(t.getHead().getLiteralText(), t.getStartLineNumber());
  return urls;
}

function readForbidden(file: SourceFile) {
  const found: CodeAnalysis['forbidden'] = [];
  for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!FORBIDDEN_IDENTIFIERS.has(id.getText())) continue;
    const parent = id.getParent();
    // `process` as a property name (foo.process) is fine; as a free identifier it is not.
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    found.push({ what: id.getText(), line: id.getStartLineNumber() });
  }
  for (const pae of file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const name = pae.getName();
    if (FORBIDDEN_MEMBERS.has(name))
      found.push({ what: `.${name}()`, line: pae.getStartLineNumber() });
    if (pae.getExpression().getText() === 'test' && FORBIDDEN_TEST_MODIFIERS.has(name)) {
      found.push({ what: `test.${name}`, line: pae.getStartLineNumber() });
    }
  }
  return found;
}

function readKeys(file: SourceFile, root: 'users' | 'seeded') {
  const keys: Array<{ key: string; line: number }> = [];
  for (const pae of file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const obj = pae.getExpression();
    if (Node.isIdentifier(obj) && obj.getText() === root) {
      keys.push({ key: pae.getName(), line: pae.getStartLineNumber() });
    }
  }
  return keys;
}

function readFunctionCalls(file: SourceFile) {
  const calls: CodeAnalysis['functionCalls'] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (Node.isIdentifier(callee))
      calls.push({ name: callee.getText(), line: call.getStartLineNumber() });
  }
  return calls;
}
