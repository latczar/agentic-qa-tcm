# ADR-0003: Deterministic, rule-based context retrieval instead of embeddings

Date: 2026-09-16
Status: accepted

## Context

The context builder has to decide which page objects, fixtures and exemplar tests to show the model for a given manual test case, out of a whole framework, within a token budget. The conventional answer for "pick relevant chunks from a larger corpus" is RAG: embed everything, embed the query, retrieve by cosine similarity from a vector store.

## Decision

No embeddings and no vector database anywhere in this project. The context builder ranks page objects with a small lookup table (`FEATURE_PAGES`: which page objects a feature normally needs) plus keyword overlap between the manual test case's steps and each page object's methods, and picks exemplar tests by matching feature tags. Every ranking decision is a plain `if`/sort a human can read, and every choice is recorded in the attempt's context receipt.

## Reasons

1. **The corpus is small and structured.** `packages/e2e-framework` has 12 page objects and ~19 exemplar tests, each with a feature tag and a name. A lookup table plus keyword overlap gets the right answer at this size; embeddings solve a problem (find relevant text in an unstructured pile of thousands of documents) this project does not have.
2. **Determinism matters more than recall.** The same test case must produce the same retrieved context every time, so a change in the model's output can be attributed to a change in the model, the prompt, or the framework — never to a nearest-neighbour search landing differently. Embedding similarity is not guaranteed stable across even a library patch version.
3. **No new infrastructure.** A vector database (or even an in-process index) is a dependency, a thing to run, and a thing to explain, for a ranking problem five lines of TypeScript already solves. This is the same reasoning as ADR-0001 and the project's stated non-goals (no Kubernetes, no Redis, no message queues): infrastructure is added only when a concrete need appears.
4. **Explainable in an interview.** "It ranks page objects by feature tag, then keyword overlap with the steps, capped by a token budget" is a complete, honest answer. "It's cosine similarity over embeddings from model X" invites a follow-up about chunking strategy and embedding model choice that this project has no real answer to, because it was never needed.

## Consequences

- This would not scale as-is to a framework with hundreds of page objects across many unrelated products; the keyword-overlap heuristic degrades as the vocabulary gets noisier. That is a real limitation, not a hidden one — see the README's honest-limitations section.
- Retrieval quality is only as good as the `FEATURE_PAGES` table and the manifest's method names; there is no fallback to "vaguely related" the way embeddings can offer. In practice G2 (symbol existence) catches the model reaching for something that was not retrieved, so a bad retrieval choice shows up as a specific, fixable gate failure rather than a silent wrong answer.
- If the framework outgrows this, the natural next step is agentic mode doing more of the searching itself via `search_symbols` (already token-aware fuzzy search over the manifest), before reaching for embeddings.
