---
status: accepted
---

# `report-bug` reproduces the failure, writes two shapes, and the safe one is the default

[ADR 0006](0006-operation-set-and-renderer-contract.md) admitted `report-bug` as an operation owing
the [[Envelope]] like any other and deliberately left the payload open, because _what is safe to
include_ is a PRD §28 privacy question rather than a renderer one. This closes it.

`report-bug` is the only operation whose **output is meant to travel**. [ADR
0004](0004-index-storage-and-invalidation.md) says the index never leaves the machine that built it
and [ADR 0008](0008-baseline-retention.md) extends that to baselines verbatim; the whole product is
built on data staying put. A [[Report]] is the deliberate exception, and the exception has to be
drawn precisely or the rule stops meaning anything.

## The rule

> A fact about **codedocs or the machine** is in the default [[Report]]. A fact that **names the
> user's code** is behind `--with-repository`. Nothing is disguised, and codedocs never moves the
> file.

The default is what a user pastes into a public issue **without reading it**, which is the only
assumption worth designing against.

## Two readers, not two sensitivities

PRD §29 names two readers in four lines, and they want opposite things:

| Reader               | Where it runs      | What it already has  |
| -------------------- | ------------------ | -------------------- |
| "an AI coding agent" | the user's machine | the repository, open |
| a GitHub issue       | in public          | nothing but the file |

Redacting anything from the first is theatre that costs it the diagnosis: the agent can read the
source it is being protected from. Withholding nothing from the second is a leak with a footnote. So
the split is by **reader**, not by sensitivity — one flag, `--with-repository`, whose name says what
it adds rather than what it hides.

This makes the wrong default recoverable and the right one free. A maintainer who needs more asks for
one flag; a user who pastes the default unread has disclosed their operating system and our version
numbers.

## The report is a reproduction, not a recollection

`report-bug` **takes the failing command and re-runs it**:

```bash
codedocs report-bug -- trace 'src/auth/service.ts#AuthService.login' --depth 3
```

Nothing is recorded today — the only files any codedocs package writes are `.codedocs/index.db` and
`.codedocs/.gitignore` — so the alternative was to start keeping a log of the user's activity that
nothing else needs. Re-running instead buys the one thing a log cannot: the payload is the envelope
of a failure happening **now**, not a remembered one that may no longer reproduce. It also makes ADR
0006's claim literal rather than nearly true — `request` echoing the resolved subject **is** the
reproduction command PRD §29 asks for, because the report was produced by running it.

The re-run's exit code, duration and envelope are fields in the report. `report-bug`'s own exit code
is not affected by them; see below.

## The field list

Every field that exists today — `IndexHeader`, `Envelope`, `ProjectPreflight`, `counts()` — sorted by
the rule.

| Fact                                                                  | Default | `--with-repository` |
| --------------------------------------------------------------------- | :-----: | :-----------------: |
| codedocs version, `SCHEMA_VERSION`, `STORE_SCHEMA_VERSION`            |   ✅    |                     |
| Node, OS and architecture, package manager name and version           |   ✅    |                     |
| Lockfile **filename** (`pnpm-lock.yaml`)                              |   ✅    |                     |
| `typescriptVersion` the index was built with                          |   ✅    |                     |
| Operation name, and every flag given                                  |   ✅    |                     |
| The subject as typed, and the `SymbolId`s it resolved to              |         |         ✅          |
| `snapshot.dirty`, `snapshot.analysedAt`                               |   ✅    |                     |
| `snapshot.commit`                                                     |         |         ✅          |
| [[Fidelity]] and cause **as a distribution**                          |   ✅    |                     |
| `conditions[].project` — the `tsconfig` paths                         |         |         ✅          |
| [[Blind spot]] **reasons**, with a count each                         |   ✅    |                     |
| Blind-spot **subjects** — the file paths                              |         |         ✅          |
| `budget`; the re-run's exit code and duration                         |   ✅    |                     |
| Counts: projects, files, symbols, call edges, unresolved **by cause** |   ✅    |                     |
| [[Unresolved specifier]] **strings** (`@calcom/prisma/enums`)         |         |         ✅          |
| `compilerOptions`, the [[Environment fingerprint]]                    |         |         ✅          |
| The repository's own dependency versions                              |         |         ✅          |
| `codedocs.jsonc`: **which keys are set**                              |   ✅    |                     |
| `codedocs.jsonc`: their values                                        |         |         ✅          |

Three rows are decisions rather than bookkeeping.

**PRD §29's "relevant dependency versions" resolves to two**: TypeScript and the package manager.
They are the only ones that change what codedocs does. A repository's own dependency list is its
stack, its vendors and its private registry scopes, and it has never diagnosed a codedocs bug.

**Fidelity is reported as a distribution** — "34 projects: 31 `typed`, 3 `unprepared`" — rather than
as one row per project. That diagnoses every fidelity bug this repo has met, where
`packages/lib/tsconfig.json` diagnoses none of them better. The same reasoning turns 542 unresolved
specifiers into a cause histogram; ADR 0009 already established that the interesting fact about
`apps/web` is that **302 of its 542 are one specifier**, and a count carries that.

**The [[Environment fingerprint]] is behind the flag even though it is opaque.** It is a hash of the
lockfile and of the set of files a project globs — repository content, one step removed. Treating a
hash of the user's code as publishable is the exact position the next section rejects, and it cannot
be right here and wrong there.

`snapshot.commit` is the row worth defending: it is the single most useful field for a public
repository and a meaningless 40 hex for a private one. It sits behind the flag because it is a lookup
key that names **which** repository, and the default shape's only promise is that it does not.

## Hashing is not on the table

[#16](https://github.com/magicspon/codedocs/issues/16) asked whether paths and symbol names could be
one-way hashed "given ADR 0002's ids are already structural rather than semantic". They are not. [ADR
0002](0002-internal-representation-and-symbol-identity.md) settled that a `SymbolId` is a SCIP string
of **name plus path**, with each descriptor segment "taken from what the author wrote" — the id _is_
`src/auth/service.ts#AuthService.login`. It is deterministic, not anonymous, and all six systems that
ADR surveyed derive identity the same way.

Hashing would therefore destroy content rather than reveal an existing structure, and it would take
the diagnosis with it. The two identity defects this repo has actually filed are unreadable without
the literal text: [#34](https://github.com/magicspon/codedocs/issues/34)'s **6,746 declarations
collapsing onto 1,571 ids**, and the `catch (err)` [[Collision]]s at **405 declarations across 330
ids**. Both were found by reading descriptor paths.

A hash would also be a weak promise to make. The input space is filenames and identifiers — a
dictionary — and any public repository can be enumerated against it. And it is worthless to the
reader Q1 put first: an agent on the user's machine cannot act on `a3f9c2…`.

**Decide which facts go in, never how to disguise them.**

## Free text is the hole no field rule closes

Every row in the table has a fixed type. An error message does not. `args.ts` already emits
``--limit must be a non-negative integer, got `foo` `` — user input, interpolated — and a resolver
error will interpolate a `SymbolId`. No rule that classifies _fields_ can classify a sentence.

So `EnvelopeError` becomes a **code plus typed parameters**:

```jsonc
{
  "code": "unknown-subject",
  "params": { "subject": "src/auth/service.ts#AuthService.login" },
}
```

The default report carries `code` and drops `params`; the human renderer formats the two into the
sentence it prints today. The classification is then structural and stays true as errors are added,
which is the property a scrubbing regex does not have. It is cheap now — five operations — and
expensive at fifteen. It also improves the machine renderer on its own terms: an agent can branch on
a code without parsing English.

Stack traces are separable and safe. `main.ts` currently keeps `error.message` and throws the stack
away; it must keep the stack, and the report keeps the frames that resolve **inside codedocs' own
installed package** and drops the rest — ours is our code, and anything below it is the user's.

## Where the file lands, and what the user is told

**`./codedocs-report.json`**, in the working directory, a fixed name, overwritten each run.
`--out <path>` redirects it and `--out -` writes to stdout, which is what the agent reader pipes.

Not `.codedocs/`: ADR 0004 documents that directory as invisible to `git status` and safe to delete,
and a file the user is meant to find, read and attach fails both. codedocs writes the one file it was
asked for and edits nothing else — not the user's `.gitignore`, not their config.

The disclosure is **in the file as well as on the terminal**, because terminal output does not travel
with an attachment pasted a week later. The file opens with a header block naming its shape:

```jsonc
{
  "repositoryFacts": "excluded", // or "included", under --with-repository
  "contains": "codedocs and machine facts only: no file paths, symbol names or commit",
}
```

and the human renderer prints, on writing it: the path, the shape, a category summary with counts
(`3 blind-spot reasons, 0 paths, 0 symbol names`), and — in the default shape only — one line saying
that `--with-repository` exists and what it adds. **No confirmation prompt**: the default is already
the safe one, and a prompt over a safe default only teaches people to dismiss prompts.

## codedocs never transmits it, and that is checked

Writing bytes is where codedocs stops. Every step after it is the user's: no upload, no
`gh issue create`, no offer to open a browser, and no telemetry that a report was generated.

This is recorded as an **invariant with a test**, not a promise: no codedocs package may import a
network module or depend on one that does, enforced by a check over the dependency tree. It is nearly
free today — one runtime dependency, `typescript` — and it is worth nothing as prose the moment
someone adds an HTTP client for an unrelated reason. `report-bug --submit` is the convenience that
would make PRD §28 unverifiable, so the check is what forbids it rather than anyone's memory.

## Exit codes

`report-bug` **exits 0 iff it wrote a report, and 2 if it could not.** It never reaches 1, which is
what the blank in ADR 0006's table now means deliberately.

The re-run's exit code is a field, never propagated. Propagating it would make `report-bug` return 1
exactly when the bug reproduced, inverting the meaning exit 1 carries everywhere else in that
table — the operation's own finding is "a report exists", and it succeeded.

## Considered Options

- **One full payload, on the reasoning that running `report-bug` is consent.** Rejected: PRD §28
  makes this a privacy decision, and the design assumption has to be that the file is pasted unread.
  Consent to produce a file is not consent to its contents when nobody read them.
- **One redacted payload, the only shape.** Rejected on the ticket's own test: a report that cannot
  reproduce the bug wastes both sides' time, and the local agent reader is redacted against source it
  can already open.
- **One-way hashing of paths and `SymbolId`s.** Rejected — see above. It is destruction wearing
  reversibility's clothes, it makes the repo's own identity defects undiagnosable, and a dictionary
  of filenames is not a hard preimage.
- **Recording each run to `.codedocs/last-run.json` for `report-bug` to read.** Rejected: a new
  persistent artefact about the user's activity, a class of stale-report bug, and ADR 0004 gives
  `.codedocs/` exactly one job.
- **Piping an envelope in** (`codedocs trace X --json | codedocs report-bug`). Rejected: it cannot
  capture a crash, which is the case that most needs a stack.
- **Writing the report into `.codedocs/`.** Rejected: invisible to git and documented as deletable,
  which are the two properties an attachment must not have.
- **`report-bug --submit`, or opening a browser at a prefilled issue.** Rejected: it is precisely the
  feature that turns "codedocs never transmits" from a checkable property into a claim about
  intentions.
- **A confirmation prompt before writing.** Rejected: a prompt over a default that is already safe
  trains dismissal, and the prompt that matters — what is in the file — is answered by the file.
- **Regex-scrubbing error messages.** Rejected: a privacy control that fails silently the first time
  a message takes a shape it does not match is worse than none.
- **Propagating the re-run's exit code.** Rejected: it inverts exit 1's meaning at the one moment the
  user is already having a bad time.
- **The repository's full dependency tree, reading PRD §29 literally.** Rejected: two of them change
  what codedocs does and the rest is the user's stack.

## Consequences

- **ADR 0006's open consequence is closed.** Its `report-bug` row keeps `—` in the result-unit and
  sort columns — a report is one object and `--limit` does not apply — and the blank in its exit
  column is now the decision recorded above rather than an omission.
- **`EnvelopeError` changes shape**: `code` plus typed `params`, no formatted `message` on the wire.
  `SCHEMA_VERSION` goes to **3**, `main.ts` stops discarding stacks, and `args.ts`'s parse failures
  become codes. Filed as [#55](https://github.com/magicspon/codedocs/issues/55).
- **`report-bug` is the one operation exempt from ADR 0006's byte-identical reproducibility rule.**
  Its payload carries a timestamp, an OS and a Node version by design. Better an exemption written
  down than a fixtures test that fails on the second machine.
- **The global flag set stays closed.** `--with-repository` and `--out` are per-operation flags,
  which ADR 0006 permits as additive only.
- **codedocs writes exactly one file outside `.codedocs/`,** only when asked, at a path the user can
  predict.
- **"No network" becomes a build-time check** over the dependency tree, alongside the boundary rules
  `fallow` already enforces. Any future dependency that reaches the network fails the build rather
  than a review.
- **CONTEXT.md gains [[Report]]**, and [[Envelope]]'s error gains its shape — a code and typed
  parameters, never a formatted sentence.
- **Implementation is filed, not done**: the operation, its two shapes, destination and disclosure in
  [#56](https://github.com/magicspon/codedocs/issues/56); the typed-error change in
  [#55](https://github.com/magicspon/codedocs/issues/55); the no-network check in
  [#57](https://github.com/magicspon/codedocs/issues/57).
- **Revisit trigger.** If maintainers routinely have to ask reporters to re-run with
  `--with-repository`, the split is in the wrong place — the measure is how many reported issues need
  a second round trip, not how many fields the default holds.
