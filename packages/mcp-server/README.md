# MCP server (`packages/mcp-server`)

Exposes the framework manifest to an agent as seven read-only Model Context Protocol tools. Nothing here writes files, runs tests or talks to the TCM; those actions belong to the orchestrator, which is the point: the model gets read tools, the pipeline keeps the write actions.

| Tool                | What it returns                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `list_page_objects` | Each page object with its `app.<field>`, description and member counts                      |
| `get_page_object`   | Method signatures, kinds, JSDoc, locators with test ids, inherited members, optional source |
| `list_fixtures`     | Fixtures, seed users, seeded record ids and date helpers, and where to import them from     |
| `get_conventions`   | `CONVENTIONS.md` verbatim                                                                   |
| `find_examples`     | Existing specs filtered by feature or keyword, with titles and tags                         |
| `get_example`       | The source of one example spec                                                              |
| `search_symbols`    | Fuzzy search over every name a spec may use; invented names get the nearest real one        |

Design rules: read-only; compact by default; outputs bounded; unknown names answered with "did you mean"; file reads confined to the framework directory.

## Run it

```bash
npm run manifest:build      # once, or whenever the framework changes
npm run mcp                 # stdio server, for the orchestrator or any MCP client
```

`.mcp.json` at the repo root registers the same server for Claude Code, so an IDE agent sees exactly the context the pipeline sees. To poke at it interactively:

```bash
npx @modelcontextprotocol/inspector node --import tsx packages/mcp-server/src/stdio.ts
```

## Tests

`npm test` drives the server through the SDK's in-memory transport: tool listing, every tool's happy path, typo suggestions, path confinement and invalid arguments.
