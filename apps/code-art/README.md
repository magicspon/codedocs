# code-art

Interactive 3D art made from a codedocs index. Every picture is a function of
the data, so each shape can be read back as a fact about the code.

## Run it

Anyone with the CLI installed can run `codedocs art` in a repo. This writes
the viewer, with the data inlined, to `.codedocs/art/index.html`. Add
`--frames 16` for a timeline. The rest of this page covers working on the art
itself.

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

## Search and trace

Type part of a path in the search box, or click any file, to trace it. Press
`/` to jump to the box and Escape to clear it.

- Every word you type must appear in the path. Case does not matter. A full
  path traces that one file alone.
- The rest of the scene goes dark. The matched files glow, and the files the
  trace reaches stay lit.
- Arcs join the traced files. Light runs along them from caller to callee, one
  hop at a time. Blue light flows in (the callers), and amber light flows out
  (the callees). The callers fire first, so you watch the flow arrive at the
  file and then leave it.
- Choose **Calls** or **Imports** to follow, which way to follow them, and how
  many hops (1 to 4).
- A trace starts from at most 60 matches, and a busy file shows only its 24
  heaviest links at each hop. This keeps the picture readable.
- `&q=` in the URL opens a search directly, for example
  `?data=codedocs&scene=city&q=operations/trace.ts`.

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

| Reading        | Galaxy                                  | City                                                                                        |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hotspot        | the file's core flares, orange to white | a pillar of warning light on the roof, taller and redder as it heats; its windows flush red |
| Heating up     | the flare pulses                        | a pulse climbs the pillar and the windows throb                                             |
| Cooling        | the flare sinks to a dull red           | the pillar burns low and greys towards smoke                                                |
| Unused file    | the file's stars fade to grey           | the windows go out and the shell cools to concrete                                          |
| Hard to change | —                                       | the facade rusts                                                                            |
| Whole repo     | —                                       | the air thickens with smog and the stars go out                                             |
| Copied code    | a pale blue thread joins the two files  | —                                                                                           |

- Heat is the square root of the hotspot score, so a score of 10 still shows
  without the hottest file drowning the rest.
- Rust starts at a maintainability of 85 and is full at 50. Real files sit
  between about 50 and 99, and a healthy repo's worst file lands near 85.
- The trend is fallow's: it compares the file's recent commits with its older
  ones inside the hotspot window. Over a timeline it blends from commit to
  commit, so you can watch a file start to pulse before it gets hot.
- The weather is the one reading no single building gives. It averages every
  file's heat, wear and unreachability, and a repository where a tenth of the
  files are fully in trouble reads as half choked. A city can raise only a few
  pillars and still be hard to breathe in.

## The city

Away from the lens, the city is built from the index alone.

| Shape         | Reading                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Footprint     | bytes on disk                                                                                                                                 |
| Height        | symbols declared                                                                                                                              |
| Setbacks      | one per kind of symbol beyond the first, so a file mixing classes, types and enums is a stepped tower and a file of plain functions is a slab |
| Lit windows   | calls and references touching the file, per symbol; a file nothing reaches keeps only its stairwell light                                     |
| Window colour | the kind of symbol the file mostly declares                                                                                                   |
| Roof mast     | calls arriving from other files                                                                                                               |
| Arcs          | the heaviest call routes, with light travelling along them                                                                                    |

Windows are a fixed real size, so a taller building simply has more floors, and
the floors of a setback line up with the shaft beneath it. Seen from far
enough away the grid averages into a wash rather than shimmering.

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
- Hotspots leave out the commits at a shallow clone's cut-off. git shows each
  of them adding every file, which would make every file look like a hotspot
  that is cooling down.
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
- `scripts/snapshot.ts` and `scripts/history.ts` are the export and the
  timeline as functions. `export.ts` and `timeline.ts` wrap them for the dev
  viewer, and `codedocs art` imports them through `scripts/pipeline.ts`.

The dev viewer loads data as modules, not requests (ADR 0011).

## What `codedocs art` ships

`pnpm build` here runs `vite build --mode embed`. That makes one
self-contained `dist/index.html`, and the CLI build copies it to
`dist/art/viewer.html`.

- The script and stylesheet are inlined (`scripts/single-file.ts`). A
  browser will not load a module from a file on disk, but it will run the
  same code inline.
- No dev export goes into the page. `codedocs art` adds each dataset as a
  `<script type="application/json" data-dataset>` block (`scripts/page.ts`),
  and the viewer parses one only when it is opened.
- The page has a Content-Security-Policy of `default-src 'none'`. three.js
  contains loaders that call `fetch`. The viewer never uses them, but the
  build cannot remove them, so the browser is told to refuse any request.

All dependencies are dev-only. The package is never published: the CLI
bundles the node side of it, and ships the viewer as a built page.
