import { isTestCall, matcherNameOf } from './test-calls.js';

/** Web-first matchers that observe the page. */
const STATE_MATCHERS = new Set([
  'toBeVisible',
  'toBeHidden',
  'toBeAttached',
  'toBeInViewport',
  'toHaveText',
  'toContainText',
  'toHaveValue',
  'toHaveValues',
  'toHaveCount',
  'toHaveURL',
  'toHaveTitle',
  'toBeEnabled',
  'toBeDisabled',
  'toBeEditable',
  'toBeEmpty',
  'toBeChecked',
  'toBeFocused',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveCSS',
  'toHaveId',
  'toHaveJSProperty',
  'toHaveAccessibleName',
  'toHaveAccessibleDescription',
  'toHaveRole',
  'toHaveScreenshot',
  'toBeOK',
]);

/** Page object assertion helpers are named expect*, for example app.leave.expectRequestListed(). */
const PAGE_OBJECT_ASSERTION = /^expect[A-Z]/;

/**
 * Every test must observe the page at least once, either through a web-first matcher
 * or through a page object `expect*` helper. A test with no such assertion passes
 * whatever the application does.
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require at least one page-state assertion per test.' },
    schema: [],
    messages: {
      none: 'This test never asserts page state. Add a web-first expect or a page object expect*() call.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const counts = new Map();

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          counts.set(node, 0);
          return;
        }
        if (!isStateAssertion(node)) return;
        const enclosingTest = sourceCode.getAncestors(node).reverse().find(isTestCall);
        if (enclosingTest) counts.set(enclosingTest, (counts.get(enclosingTest) ?? 0) + 1);
      },
      'CallExpression:exit'(node) {
        if (isTestCall(node) && counts.get(node) === 0) {
          context.report({ node: node.arguments[0] ?? node, messageId: 'none' });
        }
      },
    };
  },
};

function isStateAssertion(node) {
  const matcher = matcherNameOf(node);
  if (matcher) return STATE_MATCHERS.has(matcher);
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    PAGE_OBJECT_ASSERTION.test(callee.property.name)
  );
}
