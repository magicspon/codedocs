# codedocs

## graphify

This project has a knowledge graph at `graphify-out/`.

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json`
  exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for
  focused concepts.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review.
- After modifying code, run `graphify update .` (AST-only, no API cost). Doc, image and config
  changes need `/graphify . --update`.
- Graph outputs are derived artifacts. Never hand-edit anything in `graphify-out/`.

## fallow

Static analysis for dead code, duplication, complexity and dependency hygiene. Config is
`.fallowrc.jsonc`, whose `entry` list is every published entry point — anything unreachable from one
of those is genuinely dead.

- After modifying code, run `fallow audit --format json --quiet --base main || true`.
- Append `|| true` to every fallow command: exit 1 means "issues found", only exit 2 is a real error.
- Before deleting anything fallow reports as unused, confirm with `fallow dead-code --trace
FILE:EXPORT`. Fallow is syntactic; an export can be imported-but-unreferenced and a dependency can be
  loaded by config rather than by import.

## Comments

- Always comment your code (unless it's very obvious).
- Explain **why**, not what. Keep comments _short_ and _concise_.
- `// TODO(WP-xxx):` for known incomplete work.
- JSDoc on all exported functions and types.
- Keep comments short; a single paragraph is usually enough.
