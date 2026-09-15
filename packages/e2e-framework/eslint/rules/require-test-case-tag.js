import { isTestCall } from './test-calls.js';

const TAG = /^@TC-\d+$/;

/**
 * Every test must be traceable to a manual test case through a tag such as `@TC-010`,
 * given as `test('title', { tag: '@TC-010' }, fn)`. Titles containing the tag are also accepted.
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require a @TC-<id> tag on every test.' },
    schema: [],
    messages: {
      missing:
        "Test has no test case tag. Add { tag: '@TC-<id>' } as the second argument so it traces back to the TCM.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isTestCall(node)) return;
        const [title, second] = node.arguments;
        if (
          title &&
          title.type === 'Literal' &&
          typeof title.value === 'string' &&
          /@TC-\d+/.test(title.value)
        ) {
          return;
        }
        if (second && second.type === 'ObjectExpression' && hasTag(second)) return;
        context.report({ node: title ?? node, messageId: 'missing' });
      },
    };
  },
};

function hasTag(objectExpression) {
  return objectExpression.properties.some((property) => {
    if (property.type !== 'Property' || property.computed) return false;
    const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
    if (key !== 'tag') return false;
    const value = property.value;
    if (value.type === 'Literal') return typeof value.value === 'string' && TAG.test(value.value);
    if (value.type === 'ArrayExpression') {
      return value.elements.some(
        (element) =>
          element &&
          element.type === 'Literal' &&
          typeof element.value === 'string' &&
          TAG.test(element.value),
      );
    }
    return false;
  });
}
