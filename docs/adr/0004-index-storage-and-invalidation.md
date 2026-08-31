---
status: accepted
---

# The index is one SQLite file per working tree, holding one snapshot, that heals itself

The index is a **SQLite database at `.codedocs/index.db`**, opened through Node's built-in
`node:sqlite`, **gitignored**, one per working tree. It holds ADR 0002's nodes and edges and ADR
0003's labels as tables, and it describes **exactly one snapshot** — the working tree as it stood
when each project was last analysed.

Before every answer, codedocs compares the working tree against the **stat signature** it recorded,
and where they differ it **re-analyses and then answers**. Git is not in that path. An answer that
could not be brought up to date — because the user passed `--no-update`, or because another process
held the write lock — is still given, with the drifted files named as **blind spots** in ADR 0001's
sense. Silence is the one behaviour ruled out.

The measurements below are from a real cal.com corpus: the backend spike's symbol table and call
edges re-dumped with ADR 0002's SCIP-shaped ids — 48,517 symbols, 81,888 edges, 4,344 files, 40 MB
of JSON. It is a floor, not a ceiling: it holds no import edges, labels, analysis conditions or
documents.

> **Corrected by [#27](https://github.com/magicspon/codedocs/issues/27).** That corpus was
> over-counted: the spike swept each file once per project that globs it, and cal.com's files belong
> to 3.5 projects apiece. The real index over the same tree holds **41,771 symbols and 26,091 edges**
> across 4,827 files. The comparison below was run on the inflated corpus and is not re-run here —
> this decision rests on the **ratio** between the two formats, which a uniformly smaller corpus does
> not reverse, but read its absolute figures as an upper bound until
> [#29](https://github.com/magicspon/codedocs/issues/29) re-measures.
> See [`docs/research/edge-count-reconciliation.md`](../research/edge-count-reconciliation.md).

## Why SQLite, on measurement

Both formats give the same answer to "who calls this" — 176 callers. They differ in what a fresh
process pays to say so.

|                                         | single JSON blob                                         | SQLite via `node:sqlite`                 |
| --------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| cold process → one `callers` answer     | **110 ms** (65 ms parse + 19 ms reverse index)           | **30 ms**, of which the query is 0.6 ms  |
| resident memory                         | 270 MB RSS / 90 MB heap                                  | 48 MB, flat                              |
| on disk                                 | 40 MB (NDJSON 40.8 MB; gzipped 2.2 MB, +180 ms to write) | 20 MB, ids interned                      |
| after a two-file edit                   | 64 ms — the whole file, rewritten                        | **6.8 ms** — 573 symbols and 1,134 edges |
| transitive callers, worst hub, depth 12 | —                                                        | 2.7 ms, 883 symbols reached              |

The blob is not disqualified at cal.com scale. It is disqualified by **what scales**: its costs are
paid on the whole index for every answer, and the corpus above is a fraction of the real one.
`microsoft/vscode`, held in reserve as the ceiling test, is roughly nine times cal.com's TypeScript.
SQLite's numbers move with the rows a query touches instead.

`node:sqlite` specifically, not `better-sqlite3`: it ships inside Node 24.19 (SQLite 3.53.3), needs
no native module built at install time, and raises no experimental warning. SQLite is public domain,
so ticket [#3](https://github.com/magicspon/codedocs/issues/3)'s redistribution audit does not
reapply.

This is **not** a decision to use SQLite's query engine. The spike measured a warm "who calls X" at
0.04 µs from a plain `Map`, on every fixture from 5 files to 4,344. Query speed was never the
problem; load time, memory and partial writes were.

## What is on disk

```
.codedocs/
├── .gitignore        # contains `*` — written by codedocs, keeps `git status` clean
├── index.db          # the live snapshot
└── base/<commit>.db  # baselines, see below
```

`.gitignore` containing `*` makes the whole directory invisible to `git status` without the user
editing anything, which is verified behaviour, not a hope. The directory is safe to delete: that is
the supported way to force a cold build, and `git clean` already knows how.

The index is **gitignored, not committed**. Committing it was measured, not assumed: the 20 MB
database is binary, so git cannot delta it — six commits each touching about a hundred rows grew
`.git` by 25 MB. Two branches that both re-analysed would also conflict in a file no one can merge
by hand, and the index would be wrong the moment anyone checked out a branch. PRD §3.3's _generated
documents_ are still committed Markdown; the index is a derived artifact and never leaves the
machine that built it.

## Detecting drift

Drift is the difference between the working tree and the snapshot the index describes. Detecting it
runs before every answer, so its cost is added to every query.

| Check                                          | Cost on cal.com                 | When                        |
| ---------------------------------------------- | ------------------------------- | --------------------------- |
| stat every indexed file (size, mtime)          | 17 ms                           | every query                 |
| walk the tree for files that appeared          | 94 ms, 11,726 files             | every query                 |
| hash the content of flagged files              | 280 ms for _all_ files (sha256) | only the flagged ones       |
| export-shape hash, then the propagation wave   | 3–5 ms per changed file         | only where content changed  |
| per-project environment fingerprint (ADR 0001) | —                               | invalidates a whole project |

Under 120 ms buys a complete answer to "which files moved", without git. Git is deliberately absent
from this path: it cannot see untracked or ignored files that a `Project` still globs — which ADR
0003 measured at 183 files on the fixtures — and the index has to work in a checkout that is not a
repository. Git still scopes `impact`'s diff; it just does not decide staleness.

Branch switch, rebase and uncommitted edits therefore need no special cases. They are all just files
whose signature changed, and they differ only in how many: cal.com's `HEAD~1` is 2 files, `HEAD~10`
is 25, `HEAD~50` is 88, and `HEAD~200` is 3,686 — at which point the incremental wave converges on
the 22.9 s cold build, honestly and by itself.

## What invalidates what

| Trigger                                                          | Scope                                                                     | Why                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| a file's content hash changed                                    | that file, then the wave to direct importers whose own export shape moved | ticket #5                           |
| a project's `compilerOptions` or environment fingerprint changed | every file of that project                                                | ADR 0001 — types cross files freely |
| the codedocs, schema or TypeScript version changed               | the whole file: deleted, rebuilt cold                                     | see below                           |
| a `codedocs.jsonc` `classify` block changed                      | the label set, which is recomputed every run anyway                       | ADR 0003                            |

On a version mismatch the index is **discarded, never migrated**. TypeScript's own builder does
exactly this and it is the right trade: a migration is a maintenance burden on every schema change
whose failure mode is a subtly wrong index, against a 22.9 s rebuild whose failure mode is a wait.
The schema version lives in SQLite's `pragma user_version`. Note the scopes differ — `compilerOptions`
and the fingerprint are per project, so they drop one project's files, while the three versions are
index-wide.

## One index file is one snapshot

There is no snapshot dimension on the tables. A baseline for `impact`, or for
[#11](https://github.com/magicspon/codedocs/issues/11)'s cross-commit continuity, is a **separate
file** under `.codedocs/base/`, keyed by commit. The whole cal.com index is 20 MB and copies in 9 ms,
so a second file is cheap, and one keyed by commit is trivial to evict. How many to keep, and whether
to rebuild them from git on demand instead, stays the map's **snapshot retention** question; this
decision only guarantees the answer stays additive.

## Concurrency, which SQLite mostly decides

Measured, in WAL mode: while a writer held an exclusive transaction for 1.5 s, a reader in another
process answered in **1 ms**, and saw the pre-commit state. A reader is never shown a half-written
index, only an older consistent one. A second _writer_ blocked and failed with `SQLITE_BUSY`.

- A **query** tries for the write lock briefly, and on losing it answers read-only from the last
  committed state with the drift named. That is the `--no-update` path reached by another route, not
  new machinery.
- An explicit **`codedocs analyse`** waits, because the user asked for the write, and if it still
  cannot get the lock it says which process holds it rather than surfacing a database error.
- **Watch mode** is simply the writer, committing per wave, so readers are never more than one wave
  behind.

## An interrupted build leaves a partial index, not an invalid one

The cold build is 22.9 s, long enough to be interrupted. Commit granularity is a correctness choice
rather than a performance one, because against 22.9 s all the candidates are noise: one transaction
for the whole cal.com symbol table is 125 ms, committing per project (31 of them) is 130 ms, and
committing per file (4,344) is 266 ms.

Per project, because ADR 0001 already holds fidelity, analysis conditions and the environment
fingerprint at exactly that grain. A half-built index is therefore already expressible in the
existing vocabulary: finished projects are current, and the files of projects that never ran are
absent. The next run rebuilds only the projects whose analysis conditions are missing, and a query in
between answers from what exists and names the unanalysed projects as blind spots.

## Considered Options

- **A single JSON blob.** Rejected on what scales, not on what it costs today: 110 ms and 270 MB RSS
  for one `callers` answer on a corpus holding only symbols and call edges, and every one of those
  costs is paid on the whole file for every answer, however small the question.
- **Per-file JSON shards.** Rejected: it makes the write cheap and the read absurd. 4,344 files for
  cal.com, 357 ms to write them all and 125 ms to read them back — and every query that is not
  scoped to one file reads all of them. The invalidation model was never the expensive half.
- **NDJSON.** Rejected: 40.8 MB and 86 ms to parse, so it buys nothing over the blob but append,
  which is the one operation an index that must _delete_ rows on re-analysis cannot use.
- **Gzipping whatever we pick.** Rejected: 2.2 MB is a genuinely attractive number, and it costs
  180 ms to write and 28 ms to read on the whole file, every time, to save disk that is not scarce.
- **An embedded graph store.** Rejected twice over: it is a native dependency in a product that ships
  as a CLI binary, and it reopens ticket #3's licence audit — to buy a query engine the spike already
  proved is not the bottleneck at 0.04 µs warm.
- **`better-sqlite3`.** Rejected: same engine, but a native module compiled at install time, on a
  machine whose toolchain we do not control. `node:sqlite` is in the runtime we already require.
- **Committing the index.** Rejected on measurement: 25 MB of `.git` growth over six commits of about
  a hundred rows each, because binary files do not delta. It also conflicts between branches in a way
  no one can merge by hand, and is wrong the instant anyone checks one out. A team wanting shared
  knowledge shares the _documents_, which are committed by design.
- **A central cache directory keyed by the repository path.** Rejected: it keeps the working tree
  pristine and gets the common case wrong. A second worktree or a fresh clone at a different path
  silently misses its index, one at the same path silently inherits a foreign one, and eviction
  becomes our problem. In-tree, the index's lifetime is the working tree's.
- **Git as the drift detector.** Rejected: `git status` is 90 ms and does not see untracked or ignored
  files a `Project` globs, and the whole scheme collapses in a checkout that is not a repository. The
  stat signature costs less and knows more.
- **Content-hashing every indexed file on every query.** Rejected: 280 ms with sha256, 120 ms with
  sha1, to learn what 17 ms of `stat` already tells us. Hashing earns its place on the files the
  signature flags, where it stops a touched-but-unchanged file from starting a wave.
- **Refusing to answer from a stale index.** Rejected: it is honest and useless, and it makes every
  editor save a wall. The ordinary drift is 2 files, and repairing it costs less than the 30 ms the
  process spends starting up.
- **Answering from a stale index without saying so.** Rejected by PRD §27 and by the backend spike's
  own evidence — the unprepared Redwood run returned 303 symbols where the prepared one returns 434,
  silently. This is the failure mode the whole honesty layer exists to prevent.
- **Migrating the index across schema or tool versions.** Rejected: a maintenance burden on every
  schema change, whose failure mode is a subtly wrong index that nobody can detect, priced against a
  22.9 s rebuild whose failure mode is a wait.
- **A snapshot column on every table.** Rejected: it taxes every query and every write for a feature
  no ticket has specified yet, when a separate 20 MB file copies in 9 ms and evicts by deleting.
- **One transaction around the whole build.** Rejected: it costs 5 ms less than committing per
  project and throws away 22 s of work when a build is interrupted.

## Consequences

- **The index has a header**, and it is the load-bearing part of every honest answer: the commit and
  dirty state the snapshot describes, the stat signature of every indexed file, the schema, codedocs
  and TypeScript versions, and per project the ADR 0001 analysis conditions and environment
  fingerprint. This is what ADR 0002 meant by demoting `Repository` from a node to the header.
- **Every answer carries the index state it came from.** Complete, or naming its blind spots — the
  drifted files, the projects that never finished, the scope a label filter excluded. There is one
  honesty mechanism and this decision adds no second one.
- **`--no-update` exists and is not the default.** It is how a caller pins an answer to the snapshot,
  and it is also the path a query falls onto when another process holds the write lock.
- **Symbol locations are persisted as attributes.** ADR 0002 rejected `(path, offset)` as _identity_
  and kept it as a build-time join; a symbol's file and offset are still stored so `callers` can
  render `file:line`. They are refreshed whenever that file is re-analysed and never used to join
  across snapshots.
- **A `Document` node is stored like any other**, and what it points at remains
  [#8](https://github.com/magicspon/codedocs/issues/8)'s decision. Nothing here constrains it beyond
  requiring that its anchor be **durable** in ADR 0002's sense.
- **The store is a schema, not a query language.** Operations read rows and answer in code, the way
  the spike's reverse index did. Nothing in the CLI surface may expose SQL, or SQLite becomes an
  interface we cannot change.
- **`doctor` reports the index header**, which is where a user discovers that a project has been
  stale since a build they interrupted three days ago.
- **The 22.9 s cold build is a real first-run cost** and no part of this decision hides it. What it
  buys is that the second run is 30 ms, and that a branch switch large enough to cost the same again
  says so before it starts.
