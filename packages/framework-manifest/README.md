# Framework manifest (`packages/framework-manifest`)

A ts-morph extractor that turns the Playwright framework into one JSON file, `framework-manifest.json`, committed next to this README. It is the model's entire view of the framework and the validators' source of truth for what a generated test may reference. Both read the same file, so generation and validation cannot disagree.

## What is in it

- **Page objects**: class, file, description, the `app.<field>` it hangs off, locators with the `data-testid` each targets, methods with parameter types, return type, JSDoc and a kind (`navigation`, `assertion`, `locator`, `action`) inferred from naming. Inherited members are included and labelled with the class they come from.
- **Fixtures**, **seed users**, **seeded record ids** and **date helpers**, with their JSDoc.
- **Example tests**: every spec with its describe block, titles and `@TC-nnn` tags.

## Commands

```bash
npm run manifest:build   # regenerate framework-manifest.json from the framework source
npm run manifest:check   # regenerate in memory and fail if the committed file differs (runs in CI)
```

Change a page object, run build, commit both. If you forget, CI tells you.

## Why a committed artefact

Anyone can open one file and see exactly what the model was told. The drift check makes the file trustworthy. And the same extractor is deterministic, which the test suite asserts by extracting twice and comparing.
