# codedocs

A local codebase index for TypeScript, built for the questions an editor cannot answer.

Your editor tells you who calls one function, inside one project. codedocs indexes the whole
repository — every symbol, every call edge, every project — into a single SQLite file beside your
working tree, then answers questions **across** it.

Two kinds of question. **Relationship** questions are about the repository as it stands: what calls
this from anywhere, where a declaration actually comes from behind a barrel and a re-export, and what
path of calls leads out of this handler. **Change** questions compare the working tree against an
earlier commit: what a change could reach, which tests it reaches, and which documents it
contradicts.

Three things shape everything else:

- **The CLI is the product.** Every operation has a human renderer and a `--json` renderer over one
  fixed envelope, and every answer says what the analysis could not see.
- **No LLM.** codedocs emits deterministic structured facts and never prose. There is no provider, no
  API key and no inference cost anywhere in it. If you want prose, `evidence` gives your own agent
  the facts to write it from — one operation among thirteen, not the point of the tool.
- **It stops where `fallow` starts.** Dead code, cycles, duplication, complexity and boundary
  violations are `fallow`'s and are not reimplemented here. See
  [codedocs and fallow](#codedocs-and-fallow).

## Status

Pre-release, and not published to npm. Nine operations, both renderers and the MCP server work end
to end on real repositories. The rest of the design is settled in the ADRs and unbuilt. See
[What is built](#what-is-built) and [What is left](#what-is-left).

Measured on [cal.com](https://github.com/calcom/cal.com) at commit `176037d` — 4,827 files across 28
TypeScript projects:

| Operation                                         | Cost                                         |
| ------------------------------------------------- | -------------------------------------------- |
| Cold build                                        | **17 s** → 48,069 symbols, 26,091 call edges |
| One-file edit, repaired on the next question      | **0.8 s**                                    |
| Answering a warm question, process start included | **~0.3 s**                                   |
| Index on disk                                     | 17 MB                                        |

## Requirements

Node **24.19** or newer. Node runs codedocs' TypeScript directly and provides `node:sqlite`, so there
is no build step and no native module to compile.

## Install

```sh
git clone git@github.com:magicspon/codedocs.git
cd codedocs
pnpm install
```

`pnpm install` links the `codedocs` binary into `node_modules/.bin`, so run it from the repo root:

```sh
./node_modules/.bin/codedocs analyse --cwd /path/to/your/repo
```

Every operation takes `--cwd`, so you never have to run codedocs from inside the repository it is
reading. The examples below are written as `codedocs …`, as if the binary were on your `PATH` and you
were standing in the repository being read.

## Quick start

Build the index. One row per TypeScript project, and totals underneath:

```console
$ codedocs analyse --limit 6
  apps/api/v2/tsconfig.json  1863 files  typed
  apps/docs/tsconfig.json  7 files  typed
  apps/web/tsconfig.json  2316 files  typed
  example-apps/credential-sync/tsconfig.json  6 files  typed
  packages/app-store-cli/tsconfig.json  103 files  typed
  packages/app-store/tsconfig.json  23 files  typed

  48069 symbols, 26091 call edges, 89619 call sites unresolved
  rebuilt cold (4827 files): the index is empty

  showing 6 of 28 — pass --limit for more
```

You do not have to run `analyse` again. **Every question repairs the index before it answers**, so an
edit costs the repair and not a rebuild. `analyse` exists so a cold build in CI can be a step that
fails on its own, rather than a hidden cost inside the first question.

Then ask. There is no daemon and no watcher; each command is a one-shot process.

## The operations

Built:

| Operation              | Answers                                                       | Result unit    |
| ---------------------- | ------------------------------------------------------------- | -------------- |
| `analyse`              | build or refresh the index                                    | project        |
| `symbol <pattern>`     | every symbol whose name matches a glob                        | symbol         |
| `callers <subject>`    | every call edge into a subject                                | call edge      |
| `callees <subject>`    | every call edge out of a subject                              | call edge      |
| `references <subject>` | everything that names a subject without calling it            | reference edge |
| `file <path>`          | what the index holds about one file                           | file           |
| `trace <root>`         | every path of calls out of a root                             | path           |
| `doctor`               | every unmet precondition, and the command that would clear it | precondition   |
| `report-bug`           | a reproduced failure, safe to paste                           | —              |

Designed and unbuilt, in the order [ADR 0012](docs/adr/0012-audience-and-the-fallow-boundary.md)
sets:

| Operation            | Answers                                              | Result unit |
| -------------------- | ---------------------------------------------------- | ----------- |
| `impact`             | what a change could reach, against an earlier commit | symbol      |
| `evidence <subject>` | everything the index holds about one subject         | per kind    |
| `docs check`         | which documented claims the code now contradicts     | document    |
| `docs affected`      | which documents a change touches                     | document    |

There is no `affected-tests` command and there will not be one: it is `impact --label role=test`,
because a second traversal is a second thing to keep correct.

### Naming a subject

Whatever codedocs prints as an identifier, it accepts as input. Three forms:

```
packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData   exact
getPaymentAppData                                                          may match several
```

An ambiguous name is **not an error** — the answer covers every symbol it matched and the envelope
names them, because making you ask again costs a round trip to learn something the answer already
contains.

Start from `symbol` when you do not know the path:

```console
$ codedocs symbol 'getPaymentAppData'
  packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData  function  packages/app-store/_utils/payments/getPaymentAppData.ts:11
```

`symbol` is the only operation that takes a glob. It does no ranking, ever: a ranking is a judgement,
and a judgement cannot also be the guarantee that the same commit gives the same answer.

### callers and callees

```console
$ codedocs callers 'getPaymentAppData' --limit 5
  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx#PaymentPage  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx:70
  apps/web/components/booking/BookingListItem.tsx#BookingListItem  apps/web/components/booking/BookingListItem.tsx:178
  apps/web/modules/bookings/components/AvailableTimes.tsx#SlotItem  apps/web/modules/bookings/components/AvailableTimes.tsx:105
  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx#BookEventForm  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx:83
  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx#BookEventForm  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx:89

  showing 5 of 14 — pass --limit for more
```

Two lines for one caller is not a duplicate: they are two call sites, and each carries its own
`file:line` and its own honesty fields. Calls that resolve through barrel files and renamed
re-exports are followed to the real declaration.

### trace

The one no editor offers. `trace` walks outward from a root and returns **paths**, drawn as a tree
with the prefix each path shares collapsed onto the one before it:

```console
$ codedocs trace 'packages/features/bookings/lib/handleCancelBooking.ts#handler' --limit 8
  packages/features/bookings/lib/handleCancelBooking.ts#handler
    → packages/emails/email-manager.ts#sendCancelledEmailsAndSMS  packages/features/bookings/lib/handleCancelBooking.ts:509
      → packages/emails/email-manager.ts#eventTypeDisableHostEmail  packages/emails/email-manager.ts:519
      → packages/emails/email-manager.ts#fetchOrganizationEmailSettings  packages/emails/email-manager.ts:510
      → packages/emails/email-manager.ts#sendEmail  packages/emails/email-manager.ts:520,525,534
        → packages/emails/templates/_base-email.ts#BaseEmail.sendEmail  packages/emails/email-manager.ts:54
          → packages/emails/lib/sanitizeDisplayName.ts#sanitizeDisplayName  packages/emails/templates/_base-email.ts:61,62
            → packages/emails/lib/sanitizeDisplayName.ts#sanitize  packages/emails/lib/sanitizeDisplayName.ts:5
          → packages/emails/templates/_base-email.ts#BaseEmail.getMailerOptions  packages/emails/templates/_base-email.ts:66,76
          → packages/emails/templates/_base-email.ts#BaseEmail.getNodeMailerPayload  packages/emails/templates/_base-email.ts:44,51
          → packages/emails/templates/_base-email.ts#BaseEmail.printNodeMailerError  packages/emails/templates/_base-email.ts:81
          → packages/features/flags/features.repository.ts#FeaturesRepository  packages/emails/templates/_base-email.ts:33
          → packages/features/flags/features.repository.ts#FeaturesRepository.checkIfFeatureIsEnabledGlobally  packages/emails/templates/_base-email.ts:34
            → packages/features/flags/features.repository.ts#FeaturesRepository.getAllFeatures  packages/features/flags/features.repository.ts:105

  showing 8 of 250 — pass --limit for more
```

Eight paths, five files, and the shape of what cancelling a booking actually does — including that
sending one email reads a feature flag. That is the point.

Note that `--limit` counts **paths**, not lines. These eight paths draw thirteen steps, because the
tree prints a shared prefix once: `sendCancelledEmailsAndSMS` is on all eight and appears on one
line.

- The walk is **unbounded unless you bound it** with `--depth`. Measured: an unbounded walk from
  every one of cal.com's 5,217 call-graph roots yields 50,580 paths in 1.1 s, and the worst root
  exhausts at 16 steps. Only a quarter of a repository's call sites stay inside it, so a walk meets
  `node_modules` long before it meets combinatorics.
- **Cycles terminate and are reported**, marked `↺ cycle` on the step that closed the loop, never
  silently cut.
- Where `--depth` did cut a branch, that branch says so — `⇣ more calls beyond depth 3` — so a
  bounded answer can never be read as a whole one.

### doctor

Every unmet precondition in the repository, read whole — the same four signals every other answer
reports for the projects _it_ touched, over the whole index and grouped so that one cause is one
finding:

```console
$ codedocs doctor
  tsconfig.json  typed
    unprepared
      left-pad — 1 site in src/app.ts
      run `pnpm install`
    missing-generated
      @scope/pkg/enums — 1 site in src/app.ts
      run `pnpm prisma generate`
    broken
      ./nowhere — 1 site in src/app.ts

  1 project, 7 files, built by codedocs 0.0.0 against TypeScript 7.0.2
```

- **Static and instant.** It renders what the index already stored: no program is opened, nothing is
  extracted, and no sweep of its own runs.
- **One cause is one row**, whichever signal saw it. A project whose install never ran fires the
  filesystem signal _and_ leaves every declared import unresolved; those are one finding at two
  granularities, so they are reported once with both halves kept.
- **A remediation, or an honest silence.** An install command is read from the lockfile and a codegen
  command from [`codedocs.jsonc`](#configuration). `unmapped` and `broken` get no command at all —
  none would help the first, and none _is_ a command for the second — and codedocs ships with no
  built-in framework table, so a codegen it was not told about is named without a guess attached.
- **`--measure`** re-runs the filesystem signals against the working tree and names where they
  disagree with the index. It still opens no program: it is the escape hatch for the one thing the
  stored signals cannot see, an install that is present and incomplete.

```console
$ codedocs doctor --measure
  1 signal(s) disagree with the index:
    tsconfig.json dependencies: indexed analysed as `typed`, now 1 declared dependency(s) absent from node_modules: left-pad
```

`doctor` is the **first operation that can exit 1**: it does so for a cause a command would clear, and
never for `unmapped` or `broken`, because a red build that cannot be cleared is noise.

### references

The other half of the relationship set. A type named in a signature is not a call, and `callers`
cannot see it — which is why `impact` is gated on this operation rather than the other way round:

```console
$ codedocs references ProjectPreflight --limit 6
  packages/core/src/operations/measure.ts#compare typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:96
  packages/core/src/operations/measure.ts#fingerprint typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:213
  packages/core/src/operations/measure.ts#globbed typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:196
  packages/core/src/operations/measure.ts#incomplete typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:158
  packages/core/src/operations/measure.ts#nodeModules typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:135
  packages/core/src/operations/measure.ts#postinstall typeReferences packages/core/src/preflight/project.ts#ProjectPreflight  packages/core/src/operations/measure.ts:182

  showing 6 of 20 — pass --limit for more
```

- **Four kinds, kept apart**: `extends`, `implements`, `typeReferences`, and plain `references` for a
  name used as a value. SCIP conflates references with calls — `IdentifierFunction` is documented as
  "function references, including calls" — and that conflation is why it was not chosen as the
  producer.
- **A call is never also a reference.** The two sweeps split every identifier between them, so a call
  site appears in `callers` and nowhere else.
- **An import is not a reference either.** It is already an `imports` edge against the file, and
  counting it twice would make every re-export two facts about one line.
- Both directions come back in one answer, because "what names `Money`" and "what does `price` name"
  are the same edge read from two ends.

References outnumber calls, and the sweep is not free: this repository's own 112 files hold 1,425
call edges and 3,838 reference edges, which takes a cold build from 0.61 s to 0.88 s and the index
from 528 KB to 713 KB.

### file

What the index holds about one file — previously readable only by guessing a symbol name first:

```console
$ codedocs file src/types.ts
  src/types.ts  typed
    in tsconfig.json *
    declares (5)
      Ledger  class
      Ledger.record  method
      Money  interface
      Spendable  interface
      Spendable.spend  method
    imports (0)
    imported by (1)
      src/wallet.ts
```

The projects are all of them, with the canonical one — the project its facts were produced in, and so
the one whose fidelity applies — marked `*`. It takes a repository-relative path or the tail of one,
so `codedocs file types.ts` finds the same file, and a tail matching several answers about each.

## Machine output: one envelope, every answer

Pass `--json` and every operation returns the same shape, success or failure. This is what CI, a
script and an agent all read — there is no separate agent surface:

```console
$ codedocs callees 'packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData' --json
{
  "operation": "callees",
  "schemaVersion": 4,
  "request": {
    "subject": "packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData",
    "resolved": [
      "packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData"
    ],
    "limit": null,
    "depth": null,
    "scope": {
      "include": [{ "axis": "authorship", "value": "authored" }],
      "exclude": [],
      "excluded": 0
    }
  },
  "snapshot": {
    "commit": "176037d0afbe572f870a3c702985e7cd83fe6c0c",
    "dirty": false,
    "analysedAt": "2026-08-31T13:30:49.529Z"
  },
  "conditions": [
    {
      "project": "apps/api/v2/tsconfig.json",
      "fidelity": "typed",
      "analysedAt": "2026-08-31T13:30:49.529Z",
      "cause": null,
      "postinstall": false
    }
  ],
  "blindSpots": [],
  "budget": {
    "returned": 1,
    "available": 1,
    "truncated": false
  },
  "result": [
    {
      "from": "packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData",
      "to": "packages/app-store/_utils/getEventTypeAppData.ts#getEventTypeAppData",
      "attribution": "symbol",
      "file": "packages/app-store/_utils/payments/getPaymentAppData.ts",
      "line": 58,
      "provenance": "deterministic",
      "derivation": "checker-signature"
    }
  ]
}
```

Only `result` differs between operations. A failure carries `error` **instead of** `result`, so a
parser never meets a second shape:

```jsonc
"error": {
  "code": "config-invalid",
  "params": { "key": "exlucde", "expectation": "is not a key codedocs knows — did you mean `exclude`?" },
}
```

An error is a **code and typed parameters, never a sentence**. Branch on `code` — it is a closed set
— rather than matching on English that may be reworded. The human renderer builds the line it always
printed from the same two fields, so nothing changes in a terminal. The split is what lets
`report-bug` carry every code into a report you can paste in public while dropping the parameters,
which are the half that can quote your own code back at you.

Four properties a caller can rely on:

- **`request.resolved` echoes what your subject became**, which is how you feed an answer back in.
- **A total order, sorted on the data.** The same commit rebuilt gives byte-identical output, given
  the same environment and tool version.
- **`--json` is explicit and unbounded by default.** It is never inferred from a TTY, because
  sniffing a pipe makes the same command behave differently depending on where it runs — and a capped
  answer an agent reads as whole is a wrong answer with a footnote.
- **`--limit`'s default belongs to the renderer, not the operation.** Humans get 20 and a note saying
  how many were withheld; `--json` gets everything.

### Over MCP

If shelling out is the wrong shape for your agent, `codedocs mcp` serves the same operations over
stdio:

```json
{
  "mcpServers": {
    "codedocs": {
      "command": "./node_modules/.bin/codedocs",
      "args": ["mcp"]
    }
  }
}
```

One tool per operation, same name, same arguments, returning the envelope above verbatim — and no
tool that is not an operation. The tool list is derived from the same manifest the CLI parser reads,
and a call is answered by handing an argv to the function `codedocs` itself calls, so the bytes are
the bytes `--json` produces by construction. `mcp` is not an operation: it owes no envelope and
appears in no tool list.

## codedocs and fallow

This repository uses both, and the split is deliberate rather than incidental. **codedocs implements
no analysis `fallow` already ships** — not because the overlap would be hard, but because two tools
answering one question about one repository will disagree, and you would have no way to decide which
is right.

| You want to know                             | Reach for                                     |
| -------------------------------------------- | --------------------------------------------- |
| Is this export used anywhere?                | `fallow dead-code`, then `--trace` to confirm |
| Are there import cycles?                     | `fallow dead-code`                            |
| Is this logic duplicated?                    | `fallow dupes`                                |
| Which files are complexity hotspots?         | `fallow health`                               |
| Did this branch cross an architecture layer? | `fallow audit --base main`                    |
| What calls this, across every project?       | `codedocs callers`                            |
| What actually happens when this runs?        | `codedocs trace`                              |
| What does this change reach?                 | `codedocs impact`                             |
| Which tests does this change reach?          | `codedocs impact --label role=test`           |
| Which docs does this change contradict?      | `codedocs docs check`                         |

The line is the shape of the question. `fallow` reads the repository's text and reports its hygiene;
codedocs resolves its symbols and reports its relationships and what a change to them reaches. The
reasoning is [ADR 0012](docs/adr/0012-audience-and-the-fallow-boundary.md).

## Three kinds of honesty, kept apart

An answer that cannot say what it missed is worse than no answer. codedocs separates three things
that are usually blurred into one score:

| Channel        | Means                    | Does codedocs know what it missed? |
| -------------- | ------------------------ | ---------------------------------- |
| **Blind spot** | could not see it         | no — that is why it is named       |
| **Truncation** | withheld it deliberately | yes, exactly                       |
| **Scope**      | you excluded it          | it was part of the question        |

Blind spots and truncation are live in the envelope today; scope has no flag yet, and arrives with the
label layer.

`conditions` carries the **fidelity** of only the projects the answer touched — `typed` where the
type checker ran, `syntactic` where a precondition was unmet — because cal.com has 28 projects and 27
of them have nothing to say about one `callers` answer.

Fidelity is never a percentage and never a grade. It says which analysis ran, not how good the
codebase is. **codedocs never executes your repository's code**, under any flag, so a missing install
or a codegen step that has not been run lowers a file's fidelity and names the cost, rather than being
fixed behind your back.

## Scope: the labels, and what an answer excluded

Every file carries two labels, on axes that are deliberately **orthogonal**: `role`
(`source | test | config`) and `authorship` (`authored | generated`). A single exclusive enum
misclassifies every interesting file in the fixtures and always in the same direction — it drops real
source out of the graph. `next.config.ts` is config _and_ type-checked source;
`apps.metadata.generated.ts` is generated _and_ real source.

| Axis         | Signal                                                           | Provenance      |
| ------------ | ---------------------------------------------------------------- | --------------- |
| both         | a `classify` glob in `codedocs.jsonc`                            | `deterministic` |
| `authorship` | whether git tracks the file                                      | `deterministic` |
| `authorship` | an `@generated` sentinel in the first five lines                 | `syntactic`     |
| `authorship` | `*.generated.*`, `next-env.d.ts`, `.next/types/**`, `.prisma/**` | `inferred`      |
| `role`       | `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `*.config.*` | `inferred`      |

**Every signal that fires is stored**, with its own provenance and derivation, and precedence decides
only which one an answer acts on. That is what lets `codedocs doctor` report where two signals
disagreed — the `@generated` header without the matching name, the `.test.ts` inside `src/` — which is
how you discover that `classify` in [`codedocs.jsonc`](#configuration) exists and which file needs it.

`role` is mostly `inferred` and `authorship` mostly `deterministic`. That asymmetry is the honest
report, not a defect: git knows what it tracks, and nothing but convention knows what a test is.

Filter any answer with one generic pair, rather than bespoke flags like `--no-tests`:

```console
$ codedocs callers charge --exclude-label role=test
  …
  scope authorship=authored, not role=test — 4 excluded by it
```

- **The default scope is `authorship: authored`, with no filter on `role`.** Test callers stay in by
  default: hiding them makes tested-but-unreferenced code look dead, which is the Redwood Cells trap
  the backend spike found and named.
- **An exclusion is a count, never a blind spot.** codedocs knows exactly what it withheld; a blind
  spot is by definition what it could not see, and filing one as the other teaches readers that blind
  spots are routine — the one thing that would destroy the signal.
- `--label` on an axis replaces the default for that axis alone, so `--label authorship=generated`
  asks about exactly what the default hides.
- The whole layer is recomputed whenever the index is repaired or `classify` changes, never
  invalidated file by file: 127 files in 13 ms here, which is what makes the simple rule affordable.

## Flags

```
--json           machine output; unbounded unless --limit is given
--no-update      answer from the stored snapshot and name the drift
--limit <n>      cap results (human default 20, --json default none)
--depth <n>      `trace` only: cap the steps per path (default none)
--cwd <path>     run against another directory
--color / --no-color

`doctor` only:
  --measure          check the signals against the working tree

`report-bug` only:
  --with-repository  add the facts that name your code
  --out <path>       where to write it; `-` is stdout (default ./codedocs-report.json)
```

Exit codes follow the `fallow` convention: **0** answered, **1** a negative finding, **2** could not
answer. `doctor` produces 1 for an unmet precondition a command would clear; ADR 0006 assigns the
only other one to `docs check` finding a contradicted claim.

<!-- cspell:ignore exlucde -->

## Configuration

Optional. `codedocs.jsonc` at the repository root — the nearest enclosing `.git` — holds the facts
about a repository codedocs cannot determine and must be told. Every key has a default, so a fresh
clone needs no file at all.

```jsonc
{
  "version": 1,
  "classify": { "vendor/**": { "authorship": "generated" } },
  "baselines": 3,
  "discover": {
    "projects": ["packages/*/tsconfig.build.json"],
    "skip": ["repos"],
  },
  "remediations": [
    { "specifier": "@calcom/prisma/*", "run": "pnpm prisma generate" },
  ],
}
```

| Key            | Default                      | What it tells codedocs                                                    |
| -------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `version`      | `1`                          | Which shape this file is for                                              |
| `classify`     | `{}`                         | Glob to `role` / `authorship`, last match wins, highest precedence        |
| `baselines`    | `3`                          | How many baselines to keep; `0` disables capture                          |
| `discover`     | `{ projects: [], skip: [] }` | Extra config paths, and extra directory names to skip                     |
| `remediations` | `[]`                         | The command that clears a `missing-generated` specifier, first match wins |

Both `discover` keys are **additive**. `discover.projects` is added to the `tsconfig.json` files the
walk found; `discover.skip` is added to the skip list, so `node_modules` cannot be removed from it. A
config key that appears to control something hard-coded elsewhere is a config that lies.

Neither key decides membership: a file is in the index if and only if a project globs it.

**It holds facts, never preferences.** A default `--limit`, an output format, a colour setting —
codedocs can determine all of them, so none may enter. Nor may a key change what is reported about
what was analysed: no blind spot, truncation, fidelity label or provenance can be configured away.

**Parsing is strict.** Comments and trailing commas are read, as `.jsonc` promises. A file that is
absent is normal and silent; a file that exists and is wrong exits 2 naming the file, the key and
what was expected, and never falls back to the defaults. An unknown key is an error, naming a near
neighbour where there is one — `exlucde` parsing to nothing, silently, is the failure this buys out.
So is a second `codedocs.jsonc` below the root: codedocs reads one, because ADR 0004 gives one index
per working tree.

The rule about what may enter the file is
[ADR 0010](docs/adr/0010-configuration-file-and-what-may-enter-it.md).

## The index

One SQLite file per working tree, at `.codedocs/index.db`, holding one snapshot. It writes its own
`.gitignore` inside `.codedocs/`, so `git status` stays clean without you editing anything, and the
directory is always safe to delete — that is the supported way to force a cold build.

It is **not** committed. Measured: it is binary, so git cannot delta it, and six commits of about a
hundred rows grew `.git` by 25 MB.

Drift is detected by stat and a tree walk rather than by `git status` — faster, and it sees the
untracked files a `tsconfig` globs that git does not. A branch switch, a rebase and a dirty tree are
then all just files whose signature changed. When a changed file's exported shape moves, the repair
propagates to its direct importers and no further; when it does not, the repair stops at that file.

## What is built

Implemented, covered by 315 tests, and measured against real repositories:

- **The index.** SQLite at `.codedocs/index.db`, one snapshot, every repeated string interned, and
  committed one project at a time — so an interrupted cold build leaves a partial index rather than
  nothing.
- **Nine operations.** `analyse`, `symbol`, `callers`, `callees`, `references`, `file`, `trace`,
  `doctor` and `report-bug`.
- **Two renderers over one envelope.** Human and `--json`, from the same operation. The operation set
  is held as data, so an operation cannot reach one renderer and miss the other.
- **Incremental repair.** Drift by stat and tree walk, and a signature-gated wave that propagates to
  direct importers only. The import graph follows every specifier form — `import`, `export`,
  `import()` and `import x = require()` — so a route or a lazily loaded component is not missed.
- **Two honesty channels.** Blind spots and truncation in the envelope, plus `conditions` narrowed to
  only the projects an answer touched.
- **The label layer, and the scope channel over it.** Two orthogonal axes per file, every signal that
  fired stored with its provenance, `--label` / `--exclude-label` on every operation, and the applied
  scope echoed on every answer with the count it withheld.
- **Preflight, and the environment fingerprint.** All four of ADR 0001's signals: whether the
  dependencies are installed, whether an install script is declared, whether a config globs anything,
  and every specifier that resolved to nothing, each with the cause behind it. A project whose
  environment moved — an install landed, a codegen wrote the directory a tsconfig already globbed —
  is re-analysed rather than answered from facts extracted on a machine that is gone.
- **Symbol identity.** A descriptor path naming every enclosing scope, with the ids that still
  collide reported rather than silently merged.
- **A bug report you can paste.** `report-bug` re-runs the failing command and writes one file whose
  default shape carries codedocs and machine facts alone. Nothing is logged, nothing is transmitted,
  and the split is by reader rather than by sensitivity (ADR 0011).
- **An MCP server.** `codedocs mcp`, one tool per operation, derived from the manifest the CLI parser
  reads.

## What is left

In build order, which is [ADR 0012](docs/adr/0012-audience-and-the-fallow-boundary.md)'s. Each step
is gated by the one above it.

1. **`impact`**, over baseline capture and retention (ADR 0008) — and with it
   `impact --label role=test`, which is what "which tests does this change reach" is.
2. **`evidence`**, once fidelity and labels are assembled into one answer.
3. **`docs check` and `docs affected`** (ADR 0005).
4. **Publishing** — codedocs is not on npm, so today it is cloned and run from `node_modules/.bin`.

Not tied to that order: normalised SCIP symbol strings in place of today's descriptor path
(`TODO(#7)` in `model.ts`); the `baselines` config key, which parses and defaults but has no consumer
until step 1; and the `AGENTS.md` discovery block that tells an agent when to reach for codedocs
([#18](https://github.com/magicspon/codedocs/issues/18)).

**`review` and `plan` are deleted.** `review` was `fallow`'s work plus `impact` and `docs affected`
printed together, and `plan` was a ranking — which cannot also be a determinism guarantee, the same
reason `search` went. Anything not on this page and not covered by `fallow` is not planned.

All open work lives in [GitHub issues](https://github.com/magicspon/codedocs/issues).

## Design documents

The architecture is written down before it is built, and the reasoning is usually more useful than
the code:

- **[`CONTEXT.md`](CONTEXT.md)** — the glossary. One meaning per term, and the words to avoid.
- **[`docs/adr/`](docs/adr)** — one ADR per hard-to-reverse decision: analysis preconditions, the
  internal representation, classification, index storage, document claims, the operation set,
  cross-commit continuity, baseline retention, what preflight measures, what may enter the
  configuration file, what a bug report may carry, and where codedocs stops and `fallow` starts.
- **[`docs/research/`](docs/research)** — the measurements the ADRs rest on, including the call-graph
  backend spike that chose TypeScript 7 over TypeScript 6 on evidence.
- **[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)** — what codedocs is for, who it is for, and
  what it will not do. The original PRD it replaced is frozen at
  [`docs/PRD-v1.md`](docs/PRD-v1.md), because the ADRs cite it by section number.

## Development

```sh
pnpm test           # vitest
pnpm typecheck      # tsc across the workspace
pnpm lint           # oxlint
pnpm check          # oxfmt --check && oxlint
pnpm check:network  # no package reaches the network, over the dependency closure
pnpm format         # oxfmt && oxlint --fix
pnpm spell-check    # cspell
```

Every performance claim in this README is measured against fixture repositories cloned into `repos/`,
with full history so change-impact work has something real to read. That directory is gitignored, so
you will not have it after a clone — cal.com is the one the numbers above come from.
