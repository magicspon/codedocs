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

Exports land in `src/data/` and are git-ignored. Each export also writes
`<name>.symbols.json`, the names of every symbol. The viewer reads it only when
you pick a file, so it does not slow down opening a dataset. `?data=vscode` in
the URL opens that dataset; add `&lens=health` to open it with the health lens
on.

## Getting around

The screen starts empty apart from a few round buttons:

- **Rocket (bottom centre), or F:** take off and fly the camera yourself. The
  flying keys appear beside it. Press it or F again to land.
- **Magnifier (top left), or `/`:** open the search.
- **Calls and imports (bottom left):** choose which links a trace follows.
- **Info (top right):** appears when a file is picked. It opens the file's
  facts, its fallow health readings and its links.

## Search and trace

Type part of a path in the search box, or click any file, to trace it. Press
`/` to open the box and Escape to clear it.

- Every word you type must appear in the path. Case does not matter. A full
  path traces that one file alone.
- The rest of the scene goes dark. The matched files glow, and the files the
  trace reaches stay lit.
- Arcs join the traced files. Light runs along them from caller to callee, one
  hop at a time. Blue light flows in (the callers), and amber light flows out
  (the callees). The callers fire first, so you watch the flow arrive at the
  file and then leave it.
- Choose **Calls** or **Imports** with the buttons at the bottom left. A
  trace always follows links both ways, up to 6 hops. Six is where most call
  traces stop finding new files, and one loop of the light still takes only
  about 15 seconds.
- When the search finds exactly one file, the camera flies to it. Clear the
  search and the camera flies back to where it was. Drag the view at any time
  to stop the flight.
- The galaxy stops turning. The file's symbols move out from its star as
  planets, with one orbit for each kind of symbol. The orbits are in kind
  order: functions are nearest the star. Point at a planet to see the name of
  its symbol. The names load the first time you pick a file. A dataset
  exported before names were added shows only the kind.
- A trace starts from at most 60 matches, and a busy file shows only its 24
  heaviest links at each hop. This keeps the picture readable.
- `&q=` in the URL opens a search directly, for example
  `?data=codedocs&q=operations/trace.ts`.

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

Add `&lens=health` to the URL to draw these readings over the galaxy. It only
draws for data that fallow ran over. Over a timeline, the readings blend from
commit to commit.

| Reading     | Galaxy                                  |
| ----------- | --------------------------------------- |
| Hotspot     | the file's core flares, orange to white |
| Heating up  | the flare pulses                        |
| Cooling     | the flare sinks to a dull red           |
| Unused file | the file's stars fade to grey           |
| Copied code | a pale blue thread joins the two files  |

- Heat is the square root of the hotspot score, so a score of 10 still shows
  without the hottest file drowning the rest.
- The trend is fallow's: it compares the file's recent commits with its older
  ones inside the hotspot window. Over a timeline it blends from commit to
  commit, so you can watch a file start to pulse before it gets hot.
- Pick a file and open the info button to see fallow's numbers for it.

## The city (archived)

The city scene has been moved to `archive/city/`, with notes on how to bring
it back. It is not built or tested.

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

Files keep one position for the whole history. A file's stars light up as it
gains symbols.

## The galaxy

| Folder       | File                               | Calls                       | Blind spots (unresolved calls) |
| ------------ | ---------------------------------- | --------------------------- | ------------------------------ |
| a spiral arm | a cluster of stars, one per symbol | light threads; hubs at core | faint red haze                 |

Star colours show symbol kind.

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
