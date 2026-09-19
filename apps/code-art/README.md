# code-art

Interactive 3D art made from a codedocs index. Every picture is a function of
the data, so each shape can be read back as a fact about the code.

## Run it

From the repo root:

```sh
# 1. Export an index (a repo root, or a path to any index.db)
pnpm --filter @codedocs/code-art export .
pnpm --filter @codedocs/code-art export repos/vscode

# 2. Start the viewer, then open the address it prints
pnpm art
```

Exports land in `src/data/` and are git-ignored. Pick a dataset and a scene in
the top-left panel. Point at anything to see the file behind it.
`?data=vscode&scene=city` in the URL opens a view directly.

## Watch a repo grow

```sh
pnpm build   # the timeline runs the codedocs CLI, so it needs a build
pnpm --filter @codedocs/code-art timeline . --frames 16
```

This analyses 16 commits spread evenly along the main line of history, oldest
first. It shows up as `<repo>.timeline` in the dataset list. It plays
automatically; use the bar at the bottom to pause or drag through the commits.

- Each commit is checked out into a temporary git worktree outside the repo,
  analysed and removed. Your working tree is never touched.
- The repo's `node_modules` are linked into each worktree so old commits still
  get full type-checked analysis. Workspace packages are pointed at the old
  commit's own copy, not today's.
- Frames are cached in `.cache/` by commit, so asking for more frames later only
  analyses the new ones. codedocs itself takes about 2 seconds a commit; a
  large repo like vscode takes minutes.

Files keep one position for the whole history. Galaxy stars light up as a file
gains symbols, city towers rise, and the landscape lifts out of the sea.

## Scenes

| Scene     | Folder       | File                                            | Calls                        | Blind spots (unresolved calls) |
| --------- | ------------ | ----------------------------------------------- | ---------------------------- | ------------------------------ |
| Galaxy    | a spiral arm | a cluster of stars, one per symbol              | light threads; hubs at core  | faint red haze                 |
| City      | a district   | a building: footprint = bytes, height = symbols | pulses along arcs; lit roofs | —                              |
| Landscape | an island    | a hill                                          | peaks and lighthouses        | lakes                          |

Star colours show symbol kind. Building colours show role: grey for source,
teal for test, amber for config and violet for generated code.

## How it fits together

- `scripts/read-index.ts` reads the SQLite index read-only and aggregates it to
  one row per file (`src/lib/atlas.ts`). It also reads older schema versions.
  `export.ts` and `timeline.ts` both use it.
- `src/lib/series.ts` folds a timeline, or a single export, into one merged
  layout plus the frames each file and call exists in.
- `src/lib/*-layout.ts` turn an atlas into geometry buffers. They are pure and
  tested (`test/`).
- `src/scenes/*.tsx` draw those buffers with React Three Fiber.

The viewer loads data as modules, not requests, so it holds no network code
(ADR 0011). All dependencies are dev-only because the package is never
published.
