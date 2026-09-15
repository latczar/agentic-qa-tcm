/**
 * Specs must not touch `page` directly. Locators and navigation belong in page objects,
 * so the framework stays the single place that knows how the application is built.
 * @type {import('eslint').Rule.RuleModule}
 */
const FORBIDDEN = new Set([
  'locator',
  'getByTestId',
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'frameLocator',
  '$',
  '$$',
  'goto',
  'click',
  'fill',
  'waitForSelector',
  'waitForTimeout',
  'evaluate',
]);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw Playwright page calls in specs; use page objects.',
    },
    schema: [],
    messages: {
      raw: 'Do not call page.{{method}}() in a spec. Add or use a page object method instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'page' &&
          callee.property.type === 'Identifier' &&
          FORBIDDEN.has(callee.property.name)
        ) {
          context.report({ node, messageId: 'raw', data: { method: callee.property.name } });
        }
      },
    };
  },
};
