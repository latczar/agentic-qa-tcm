/**
 * The manifest is the model's entire view of the framework and the validators' source of
 * truth for what a generated test may reference. Both read this one JSON file.
 */

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
}

export type MethodKind = 'navigation' | 'assertion' | 'locator' | 'action';

export interface MethodInfo {
  name: string;
  description: string;
  params: ParamInfo[];
  returns: string;
  /** Inferred from convention: goto* is navigation, expect* is assertion, returns Locator is locator. */
  kind: MethodKind;
  /** Set when the method comes from a base class such as BasePage. */
  inheritedFrom: string | null;
}

export interface LocatorInfo {
  name: string;
  /** The data-testid the locator targets, when it is a plain getByTestId call. */
  testId: string | null;
  /** The expression that builds the locator, for anything more elaborate. */
  expression: string;
  description: string;
  inheritedFrom: string | null;
}

export interface PageObjectInfo {
  name: string;
  file: string;
  description: string;
  extends: string | null;
  /** How specs reach it: app.<appField>. Null for classes not on the App bundle. */
  appField: string | null;
  locators: LocatorInfo[];
  methods: MethodInfo[];
}

export interface FixtureInfo {
  name: string;
  type: string;
  description: string;
}

export interface SeedUserInfo {
  key: string;
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  description: string;
}

export interface SeededInfo {
  key: string;
  value: string;
  description: string;
}

export interface HelperInfo {
  name: string;
  file: string;
  params: ParamInfo[];
  returns: string;
  description: string;
}

export interface ExampleTest {
  title: string;
  tags: string[];
}

export interface ExampleInfo {
  path: string;
  feature: string;
  describe: string | null;
  tests: ExampleTest[];
}

export interface FrameworkManifest {
  schemaVersion: 1;
  /** Repo-relative root of the framework package. */
  frameworkRoot: string;
  /** Where specs import `test` from, relative to frameworkRoot. */
  testModule: string;
  conventionsFile: string;
  app: Array<{ field: string; className: string }>;
  pageObjects: PageObjectInfo[];
  fixtures: FixtureInfo[];
  users: SeedUserInfo[];
  seeded: SeededInfo[];
  helpers: HelperInfo[];
  examples: ExampleInfo[];
}
