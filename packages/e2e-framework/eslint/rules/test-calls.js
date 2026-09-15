/**
 * Shared helpers for recognising Playwright test declarations and expect chains in an AST.
 */

const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

/** True for `test(...)`, `test.only(...)`, `test.skip(...)` and friends. Not `test.describe`. */
export function isTestCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'test';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'test' &&
    callee.property.type === 'Identifier' &&
    TEST_MODIFIERS.has(callee.property.name)
  );
}

/** True for `expect(...)` and `expect.soft(...)`. */
export function isExpectCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'expect';
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'expect'
  );
}

/**
 * For a matcher call such as `expect(x).not.toHaveText('a')`, returns the `expect(x)` call
 * at the root of the chain, or null when the chain does not start with expect.
 */
export function expectRootOf(matcherCall) {
  let current = matcherCall.callee;
  while (current) {
    if (current.type === 'MemberExpression') {
      current = current.object;
    } else if (current.type === 'CallExpression') {
      if (isExpectCall(current)) return current;
      current = current.callee;
    } else if (current.type === 'AwaitExpression') {
      current = current.argument;
    } else {
      return null;
    }
  }
  return null;
}

/** The matcher name of a call like `expect(x).toHaveText()`, or null. */
export function matcherNameOf(node) {
  const callee = node.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return null;
  }
  return expectRootOf(node) ? callee.property.name : null;
}
