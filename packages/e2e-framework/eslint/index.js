import noHardcodedUrls from './rules/no-hardcoded-urls.js';
import noRawLocatorsInTests from './rules/no-raw-locators-in-tests.js';
import noTrivialAssertions from './rules/no-trivial-assertions.js';
import requireStateAssertion from './rules/require-state-assertion.js';
import requireTestCaseTag from './rules/require-test-case-tag.js';

/**
 * The framework's conventions as an ESLint plugin. Applied to spec files by the root
 * eslint.config.js. The pipeline runs the same rules over generated tests, so a convention
 * written here is enforced for humans and for the model alike.
 */
const plugin = {
  meta: { name: 'eslint-plugin-aiqa-playwright', version: '0.1.0' },
  rules: {
    'no-raw-locators-in-tests': noRawLocatorsInTests,
    'no-hardcoded-urls': noHardcodedUrls,
    'require-test-case-tag': requireTestCaseTag,
    'no-trivial-assertions': noTrivialAssertions,
    'require-state-assertion': requireStateAssertion,
  },
};

/** Rule settings for spec files. Spread into a flat config block with `files`. */
export const specRules = {
  'aiqa/no-raw-locators-in-tests': 'error',
  'aiqa/no-hardcoded-urls': 'error',
  'aiqa/require-test-case-tag': 'error',
  'aiqa/no-trivial-assertions': 'error',
  'aiqa/require-state-assertion': 'error',
};

export default plugin;
