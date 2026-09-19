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
`?data=vscode&scene=city` in the URL opens a view directly; add `&lens=health`
to open it with the health lens on.

## Health readings

When [fallow](https://github.com/fallow-rs/fallow) is on your PATH, the export
also runs it over the repo and gives each file a `health` reading: complexity
scores, hotspot score and trend, copied lines and import cycles. Files that
share copied code are linked in `clones`. Add `--no-fallow` to skip it.

- Unused files and exports are only read when the repo has its own fallow
  config. Without one, fallow cannot know the entry points, and its guesses are
  too often wrong to draw.
- fallow scores only files it can reach, so some files have no complexity
  `score`. That means "not measured", not zero.
- fallow's telemetry is off unless you turn it on. The export turns it off
  anyway, so an export never sends anything.

### The health lens

Tick **Health lens** in the top-left panel to draw these readings over the
scene. It is only offered for data that fallow ran over. Over a timeline, the
readings blend from commit to commit, just as heights do.

| Reading        | Galaxy                                  | City                                          |
| -------------- | --------------------------------------- | --------------------------------------------- |
| Hotspot        | the file's core flares, orange to white | fire on the roof; taller and whiter is hotter |
| Unused file    | the file's stars fade to grey           | the tower goes dark                           |
| Hard to change | —                                       | the facade rusts                              |
| Copied code    | a pale blue thread joins the two files  | —                                             |

- Heat is the square root of the hotspot score, so a score of 10 still shows
  without the hottest file drowning the rest.
- Rust starts at a maintainability of 85 and is full at 50. Real files sit
  between about 50 and 99, and a healthy repo's worst file lands near 85.
- Point at a file to see fallow's numbers for it in the file panel.

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
  analyses the new ones. codedocs itself takes about 2 seconds a commit;
  vscode takes 1½–4 minutes a commit, so 12 frames is about 25 minutes.
- With fallow on your PATH, each frame also gets health readings. fallow's
  results are cached apart from the analysis, so adding fallow to an old
  timeline does not analyse it again. Add `--no-fallow` to skip it.
- Hotspots are scored as of each commit, not as of today. fallow measures how
  recent each change is from the day it runs, so the history is handed to it
  with every date moved forward by the commit's age. Without that, every
  file in an old frame would read as cooling.
- A shallow clone has no history to replay. Deepen it first, for example
  `git fetch --shallow-since=2025-08-31 origin main`.
- A repo without `node_modules` still works, at `syntactic` fidelity. The
  vscode fixture has none, so its timeline matches its existing index.

Files keep one position for the whole history. Galaxy stars light up as a file
gains symbols and city towers rise.

## Scenes

| Scene  | Folder       | File                                            | Calls                        | Blind spots (unresolved calls) |
| ------ | ------------ | ----------------------------------------------- | ---------------------------- | ------------------------------ |
| Galaxy | a spiral arm | a cluster of stars, one per symbol              | light threads; hubs at core  | faint red haze                 |
| City   | a district   | a building: footprint = bytes, height = symbols | pulses along arcs; lit roofs | —                              |

Star colours show symbol kind. Building colours show role: grey for source,
teal for test, amber for config and violet for generated code.

## How it fits together

- `scripts/read-index.ts` reads the SQLite index read-only and aggregates it to
  one row per file (`src/lib/atlas.ts`). It also reads older schema versions.
  `export.ts` and `timeline.ts` both use it.
- `scripts/read-fallow.ts` runs fallow and keeps only what the art reads;
  `scripts/churn.ts` builds the history it scores hotspots from, and
  `scripts/fallow-health.ts` joins the result onto the files.
- `src/lib/series.ts` folds a timeline, or a single export, into one merged
  layout plus the frames each file and call exists in.
- `src/lib/*-layout.ts` turn an atlas into geometry buffers. They are pure and
  tested (`test/`).
- `src/scenes/*.tsx` draw those buffers with React Three Fiber.

The viewer loads data as modules, not requests, so it holds no network code
(ADR 0011). All dependencies are dev-only because the package is never
published.
