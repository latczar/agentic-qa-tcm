/**
 * Specs must not contain absolute URLs. The base URL is configuration and paths belong
 * to page objects, so a spec keeps working when the application moves.
 * @type {import('eslint').Rule.RuleModule}
 */
const ABSOLUTE_URL = /^https?:\/\//i;

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow absolute http(s) URLs in specs.' },
    schema: [],
    messages: {
      url: 'Absolute URL in a spec. Use baseURL from the config and navigate through a page object.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && ABSOLUTE_URL.test(node.value)) {
          context.report({ node, messageId: 'url' });
        }
      },
      TemplateLiteral(node) {
        const first = node.quasis[0];
        if (first && ABSOLUTE_URL.test(first.value.cooked ?? '')) {
          context.report({ node, messageId: 'url' });
        }
      },
    };
  },
};
