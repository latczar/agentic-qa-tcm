import { isExpectCall, matcherNameOf } from './test-calls.js';

const WEAK_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeUndefined']);
const LITERAL_TYPES = new Set(['Literal', 'ObjectExpression', 'ArrayExpression']);

/**
 * An assertion that cannot fail proves nothing. Two shapes are banned:
 * `expect(<literal>)` such as `expect(true).toBe(true)`, and the weak matchers
 * `toBeDefined`, `toBeTruthy`, `toBeFalsy` and `toBeUndefined`, which pass for almost any value.
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow assertions that pass without proving anything.' },
    schema: [],
    messages: {
      literal:
        'expect() is called with a literal, so this assertion can never fail. Assert on page state instead.',
      weak: '{{matcher}}() passes for almost any value. Use a web-first matcher such as toBeVisible or toHaveText.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isExpectCall(node)) {
          const [argument] = node.arguments;
          if (
            argument &&
            (LITERAL_TYPES.has(argument.type) ||
              (argument.type === 'TemplateLiteral' && argument.expressions.length === 0))
          ) {
            context.report({ node, messageId: 'literal' });
          }
          return;
        }
        const matcher = matcherNameOf(node);
        if (matcher && WEAK_MATCHERS.has(matcher)) {
          context.report({ node, messageId: 'weak', data: { matcher } });
        }
      },
    };
  },
};
