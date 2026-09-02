# How codedocs works

A high-level outline of the CLI: the pieces it is built from, the path one command takes
through them, and where in the source each part lives.

This document explains **the mechanism**. It does not argue for it — the reasoning behind
each decision is in [`docs/adr/`](adr), and the vocabulary it uses is defined once in
[`CONTEXT.md`](../CONTEXT.md).

## The idea in one paragraph

codedocs reads a TypeScript repository once, resolves its symbols with a type checker, and
writes what it learned — symbols, call edges, reference edges, imports, labels — into a
single SQLite file beside the working tree. Every later question is a query against that
file. Because the file goes stale the moment you edit anything, every question also
repairs it first, re-analysing only the files that changed and only the importers those
changes could reach. There is no daemon, no watcher, no server and no model: each command
is a one-shot process that opens the index, brings it up to date, answers, and exits.

## Two packages

| Package          | Role                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `@codedocs/core` | The engine. Everything that knows about TypeScript, SQLite and the answers. |
| `@codedocs/cli`  | The binding. Argument parsing, the human renderer, the MCP server.          |

`@codedocs/core` is private and never published; the shipped npm package is
`@codedocs/cli`, bundled by tsdown into one file with `bin` pointing at `dist/bin.js`.

The split is not layering for its own sake. `core` exposes one flat surface — one exported
function per operation, in
[`packages/core/src/index.ts`](../packages/core/src/index.ts) — and nothing in `cli`
composes two of them. A binding that could combine operations would be a second product
surface to keep correct, and the CLI, `--json` and MCP would drift apart.

## The path of one command

```
argv
  │
  ▼
bin.ts ────────────► mcp.ts          `codedocs mcp` forks here: it is a server,
  │                    │             not an operation, so it owes no envelope
  ▼                    │
args.ts                └──► one tool per operation, each handing an argv back to run()
  │  parse against the manifest; a bad command line exits 2 with a code
  ▼
main.ts  run()
  │
  ├─► openSession()  ─── read config, open the store, detect drift,
  │                      repair it, recompute labels, stamp the commit
  │
  ├─► one operation from core  ─── queries the store, returns an Envelope
  │
  └─► --json ? JSON.stringify(envelope) : render.ts
                                          │
                                          ▼
                                    stdout + exit code
```

Six steps, in order.

### 1. Parse ([`packages/cli/src/args.ts`](../packages/cli/src/args.ts))

`args.ts` reads the command line against the **operation manifest** rather than against a
hand-written list of its own. The manifest
([`packages/core/src/manifest.ts`](../packages/core/src/manifest.ts)) holds every
operation as data: its name, its summary, whether it takes a subject, whether `--depth`
applies to it, which extra flags it adds, and how its result is shaped.

That is what keeps the three bindings honest. The CLI parser, the `--help` text and the
MCP tool list are all derived from the same table, so an operation cannot arrive in one and
be forgotten in another. Per-operation flags are additive and refused elsewhere: `callers
--depth 2` is an error, not a silently ignored flag, because a caller would otherwise read
a one-hop answer as a bounded walk.

A command line that cannot be parsed produces no envelope at all. There is no operation to
name, and inventing one would tell a caller that a command it never ran had failed.

### 2. Open a session ([`packages/core/src/session/`](../packages/core/src/session))

`openSession` is the one door to the index, and it does five things before an operation
sees anything:

1. **Find the repository root** — the nearest enclosing `.git`.
2. **Read the config** — `codedocs.jsonc`, before the store is opened, because a config
   that cannot be used means the user's intent is unknown.
3. **Open the store** — `.codedocs/index.db`, creating it and its `.gitignore` if absent.
4. **Work out what is out of date**, in four separate senses (see below).
5. **Repair it**, unless `--no-update` was passed, in which case the drift is reported as
   blind spots instead.

It then recomputes the label layer if anything moved, restamps the commit if only the
commit moved, and hands back a `Session`: the open store, the config, the drift set, and
the `AnswerContext` that carries the snapshot, per-project conditions and blind spots every
envelope owes.

Four things can be out of date, and they are kept apart because they are repaired
differently:

| Out of date  | Means                                                   | Repaired by    |
| ------------ | ------------------------------------------------------- | -------------- |
| `drift`      | Files changed, appeared or vanished in the working tree | a wave         |
| `stale`      | The store schema or tool version moved                  | a cold rebuild |
| `unanalysed` | A previous build was interrupted mid-project            | a wave         |
| `moved`      | A project's environment fingerprint changed             | re-analysis    |

### 3. Answer ([`packages/core/src/operations/`](../packages/core/src/operations))

`main.ts` holds a `Record<OperationName, Handler>` rather than a `switch`, so an operation
added to the manifest and forgotten here is a type error. Each handler calls exactly one
core function, passing the store, the answer context, the subject, the limit and the scope.

Every operation returns the same **envelope** — [`envelope.ts`](../packages/core/src/envelope.ts).
Only `result` differs between them:

```
operation      which question this answers
schemaVersion  one integer over the whole shape
request        the subject as typed, what it resolved to, the limit, depth and scope
snapshot       the commit, whether the tree was dirty, when it was analysed
conditions     the fidelity of only the projects this answer touched
blindSpots     what the analysis could not see, named concretely
budget         how many results exist, how many came back, whether it truncated
result         the answer   ── OR ──   error   a code plus typed parameters
```

A failure carries `error` **instead of** `result`, so a parser meets one shape. The error is
a code and typed parameters and never a formatted sentence, which is what lets `report-bug`
carry the code into a shareable report while dropping the parameters — the half that can
quote your own code back at you.

`report-bug` is the one operation that opens no session: it re-runs the command line you
gave it and reports the envelope that came back.

### 4. Render ([`packages/cli/src/render.ts`](../packages/cli/src/render.ts))

The human renderer is a pure function of the envelope. It never queries the index and never
sees a field `--json` withheld. It may colour, group, add headers and totals, wrap and
hyperlink; it may not re-sort, change a fact, drop a result silently, or omit blind spots
and truncation.

`--limit`'s default lives here rather than in the operation: a terminal gets 20 results and
a note saying how many were withheld, while `--json` is unbounded unless you ask for a cap.

### 5. Exit

`0` answered, `1` a negative finding, `2` could not answer. Only `doctor` and `docs check`
ever produce `1`.

### 6. Or: over MCP ([`packages/cli/src/mcp.ts`](../packages/cli/src/mcp.ts))

`codedocs mcp` serves the same operations over stdio JSON-RPC. The tool list is generated
from the manifest, and a tool call is answered by handing an argv to `run` — the same
function the CLI itself calls. The bytes are the bytes `--json` produces by construction
rather than by inspection.

## The index

One SQLite file per working tree, at `.codedocs/index.db`, holding exactly one snapshot —
a commit plus whatever is uncommitted on top of it. It is a derived artefact: never
committed, always safe to delete, and deleting it is the supported way to force a cold
build. The store writes a `.gitignore` containing `*` inside `.codedocs/`, so `git status`
stays clean without you editing anything.

It uses `node:sqlite` from the Node standard library, which is why codedocs has no native
module to compile and no post-install step.

### What it holds

Three kinds of thing, described in
[`model.ts`](../packages/core/src/model.ts):

- **Nodes** — `Package`, `Project`, `File`, `Symbol`, `Document`.
- **Edges** — nine kinds, including `calls`, `references`, `extends`, `implements` and
  `imports`.
- **Labels** — one classification fact about a node: an axis, a value, a provenance and the
  rule that derived it.

Alongside them, the facts that would otherwise be dropped: unresolved call sites with their
cause, and unresolved import specifiers with theirs. An edge that could not be produced is
still knowledge, and recording it is what lets an answer name its blind spots instead of
looking complete.

### How it is stored ([`packages/core/src/store/`](../packages/core/src/store))

Fifteen tables, and **every repeated string is interned**. A `SymbolId` names a file plus
the descriptors under it, so storing it verbatim wrote each path several times per symbol
and twice more per edge. The tables hold integers and the reads rebuild the strings.

That is invisible above the store module — operations still see `SymbolId` and `FilePath`,
and answers are byte for byte what they were — and it takes cal.com's index from 61 MB to
17.6 MB.

`STORE_SCHEMA_VERSION` gates the shape. A mismatch discards the index and rebuilds cold
rather than migrating, because a migration's failure mode is a subtly wrong index and a
rebuild's failure mode is a wait.

## Keeping the index current

### Detecting drift ([`drift.ts`](../packages/core/src/drift.ts))

Git is deliberately not used here. `git status` costs around 90 ms, cannot see the
untracked and ignored files a `tsconfig` still globs, and collapses entirely in a checkout
that is not a repository.

Instead: walk the source files, compare size and mtime against what the index stored, and
hash only the files that flag. Hashing everything costs 280 ms to learn what 17 ms of
`stat` already says; hashing the flagged ones stops a touched-but-unchanged file starting a
rebuild.

A branch switch, a rebase and a dirty tree are all just files whose signature changed.

### Repairing it with a wave ([`session/wave.ts`](../packages/core/src/session/wave.ts))

Re-extract the drifted files, recompute their **export-shape hashes**, and propagate to
their direct importers **only where a hash moved**. A body-only edit — the commonest edit
there is — changes no export shape, so the wave settles in one round and one file.

A ceiling of eight waves turns a bug in the shape hash into a slow answer rather than a
hung process; when it fires, the repair falls back to a cold build and `analyse` reports
that it did.

### Building cold ([`session/cold.ts`](../packages/core/src/session/cold.ts))

Discover every `tsconfig.json`, run preflight over the file walk, then extract and commit
**one project at a time**. Committing per project is what makes an interrupted build leave
a partial index rather than nothing — the projects that finished are in the index, and the
rest read as unanalysed files that the next run repairs with a wave.

## Extraction ([`packages/core/src/adapter/ts7/`](../packages/core/src/adapter/ts7))

The only part of codedocs that knows a TypeScript backend exists. Everything above it works
in terms of nodes, edges and labels.

It runs four sweeps over each project:

| Sweep              | Produces                                                     |
| ------------------ | ------------------------------------------------------------ |
| `symbols.ts`       | One `Symbol` node per id, with collisions counted not merged |
| `calls.ts`         | Call edges, and unresolved call sites with their cause       |
| `imports.ts`       | Import edges, following every specifier form                 |
| `export-shapes.ts` | The per-file hash that gates the wave                        |

Calls are collected client-side and resolved in **checker batches**, not per symbol. The
backend spike measured the per-symbol method at 12.6 ms a query, unbatchable, and projected
122 s for one cal.com project; the sweep produces a strict superset of the same edges in
4.1 s.

### Symbol identity ([`symbol-id.ts`](../packages/core/src/symbol-id.ts))

A `SymbolId` is a SCIP symbol string in codedocs' own scheme, with the workspace package
version normalised away so a `version` bump in a manifest cannot invalidate an index.
Locals are named by **descriptor path**: the dotted route from a file to a declaration, one
segment per scope, each taken from what the author wrote. That is what makes an id survive
a sibling being inserted above it, where an ordinal would not.

Ids are scoped to one snapshot. Recognising that a symbol at this commit is the same symbol
as one at an earlier commit is a separate, inferred layer —
[`continuity/`](../packages/core/src/continuity) — and never a property of the id itself.

## The honesty layer

Three things that are usually blurred into one score are kept apart, and every answer
carries all three:

| Channel        | Means                    | Does codedocs know what it missed? |
| -------------- | ------------------------ | ---------------------------------- |
| **Blind spot** | could not see it         | no — that is why it is named       |
| **Truncation** | withheld it deliberately | yes, exactly                       |
| **Scope**      | you excluded it          | it was part of the question        |

Underneath them sit two per-fact properties. **Fidelity** says which analysis ran on a file
— `typed` where a type checker was applied to its project, `syntactic` where it was parsed
only — and is stored with the facts it describes rather than recomputed at query time.
**Provenance** says where a single fact came from: `deterministic`, `syntactic` or
`inferred`, with the `derivation` naming the rule that produced it.

Fidelity is decided by **preflight**
([`packages/core/src/preflight/`](../packages/core/src/preflight)), which observes four
signals: whether dependencies are installed, whether an install script is declared, whether
a config globs anything, and every import specifier that resolved to nothing. The first
three cost microseconds and run unconditionally; the fourth is a by-product of extraction
and never a pass of its own.

codedocs never runs your repository's code, under any flag. A missing install or an
un-run codegen step lowers a file's fidelity and names the command that would clear it,
rather than being fixed behind your back.

## Labels and scope ([`packages/core/src/labels/`](../packages/core/src/labels))

Every file carries two labels on deliberately orthogonal axes: `role`
(`source | test | config`) and `authorship` (`authored | generated`). A single exclusive
enum drops real source out of the graph — `next.config.ts` is config _and_ type-checked
source.

Every signal that fires is stored with its own provenance, and precedence decides only
which one an answer acts on. That is what lets `doctor` report where two signals
disagreed. The whole layer is recomputed whenever the index is repaired or the `classify`
block changes, never invalidated file by file — 156 files in 13 ms in this repository,
which is what makes the simple rule affordable.

`--label` and `--exclude-label` filter any answer against these axes, and the applied scope
is echoed on every envelope with the count it withheld.

## Baselines and impact ([`packages/core/src/baseline/`](../packages/core/src/baseline))

A **baseline** is an index codedocs kept from a commit it once analysed. It is recorded as
a side effect of `analyse` over a clean tree, never constructed on demand, and never leaves
the machine — a `git worktree` of an old commit has no `node_modules`, and codedocs will
not run your install, so every file in a reconstructed baseline would be `syntactic`.

Three are kept, evicting anything that is not an ancestor of `HEAD` first, then the oldest
by commit date. Evicting non-ancestors first is the whole branch-switching story.

`impact` is the one operation that composes several parts of the index at once: a baseline
to say what changed, continuity to match symbols across the two commits, and a walk inward
through call and reference edges to say what would notice.

## Documents and claims ([`packages/core/src/docs/`](../packages/core/src/docs))

A **document** is any Markdown file in the repository carrying at least one **claim** — a
checkable assertion in an HTML comment, written immediately after the prose it justifies.
Discovery is a repository-wide scan for the marker, not a `docs/**` convention: writing a
claim is how a file opts in.

`docs check` evaluates each claim against the index and returns one of four verdicts, each
with exactly one producer: `verified` and `contradicted` from the claims, `potentially
stale` from a touched file changing, and `unable to verify` from a blind spot. Nothing
blends them and there is no score.

codedocs never writes to a document — no verification stamp, and no unattended repair after
a rename.

## The source tree

```
packages/cli/src/
  bin.ts        entry point; routes `mcp` before the parser
  args.ts       command line → Command, against the manifest
  main.ts       the handler table; opens a session and emits
  render.ts     the human renderer, pure over the envelope
  mcp.ts        stdio JSON-RPC server, one tool per operation
  messages.ts   error code + params → the sentence a terminal prints
  stack.ts      codedocs-only stack frames, for report-bug

packages/core/src/
  index.ts      the flat public surface
  manifest.ts   the operation set as data — what the bindings derive from
  envelope.ts   the one answer shape
  model.ts      nodes, edges, labels, and the enums over them
  symbol-id.ts  SCIP ids, descriptor paths, shorthands
  drift.ts      working tree vs. indexed snapshot
  discovery.ts  repository root, tsconfig discovery
  git.ts        read-only probes: refs, merge bases, whether the tree is clean

  operations/   one file per operation, plus subject resolution and scoping
  session/      open, cold build, wave repair, version gating
  store/        SQLite schema, interning, and one reader per node kind
  adapter/ts7/  the only module that knows TypeScript exists
  preflight/    the four signals, and the environment fingerprint
  labels/       the two axes, their signals, and scope filtering
  baseline/     capture, retention, selection
  docs/         document discovery, claim parsing, predicates, verdicts
  continuity/   matching a symbol across two commits
  config/       codedocs.jsonc — strict parsing, typed refusals
```

## Where to read next

- [`CONTEXT.md`](../CONTEXT.md) — the glossary. One meaning per term, and the words to
  avoid.
- [`docs/adr/`](adr) — one ADR per hard-to-reverse decision, and the reasoning behind
  every rule above.
- [`docs/research/`](research) — the measurements the ADRs rest on.
- [`docs/REQUIREMENTS.md`](REQUIREMENTS.md) — what codedocs is for, and what it will not
  do.
