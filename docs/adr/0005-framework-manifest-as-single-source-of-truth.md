# ADR-0005: The framework manifest is a committed, drift-checked artefact

Date: 2026-09-16
Status: accepted

## Context

The MCP server, the context builder, and gate G2 (symbol existence) all need to know what page objects, methods, locators, fixtures, users and seeded ids actually exist in `packages/e2e-framework`. That knowledge could be computed fresh from the TypeScript source on every request, or extracted once into a static file that everything else reads.

## Decision

`packages/framework-manifest` uses ts-morph to statically analyse the framework source and produce `framework-manifest.json`: every page object, method (with parameters and JSDoc), locator, fixture, user, seeded record id, and date helper. The file is committed to the repository, not generated at request time, and `manifest:check` in CI fails the build if the committed file no longer matches what `manifest:build` would produce from the current source.

## Reasons

1. **One source of truth for three consumers.** The MCP server serves the manifest's data as tools; the context builder ranks and includes parts of it in prompts; gate G2 checks generated code against it. If each of those re-derived framework knowledge independently, they could quietly disagree about what a symbol's real signature is.
2. **Fast and dependency-free at request time.** Every context build and every gate check reads a JSON file already on disk, rather than re-parsing the TypeScript project graph on every generation attempt.
3. **Drift is a CI-caught bug, not a runtime surprise.** Someone editing a page object without regenerating the manifest is exactly the kind of mistake that should fail fast and specifically, rather than silently making G2's symbol checks wrong for everyone until someone notices generated tests behaving strangely.
4. **Reviewable.** A diff to `framework-manifest.json` in a pull request shows exactly what the AI's view of the framework changed to, in the same review as the code change that caused it.

## Consequences

- An extra build step (`manifest:build`) that must be remembered after any change to page objects, fixtures, or exemplar tests — mitigated by `manifest:check` catching a forgotten one in CI rather than letting it merge silently.
- The manifest can only describe what the extractor knows how to read (JSDoc, typed method signatures, `data-testid` conventions). A framework pattern the extractor does not understand would need extractor changes, not just a source change.
- Phase 7's human review promotion (moving an approved candidate into `tests/e2e/<feature>/`) does not regenerate the manifest automatically — deliberately: promoting one test is a small, common action, while `manifest:build` is a considered step a person or CI runs, matching how `manifest:check` is meant to catch drift rather than the pipeline silently self-updating its own picture of the framework mid-run.
