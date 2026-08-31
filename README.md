# codedocs

A local codebase index for TypeScript, built for the question an editor cannot answer.

Your editor already tells you who calls one function. codedocs indexes the whole repository — every
symbol, every call edge, every project — into a single SQLite file beside your working tree, then
answers questions **across** it: what path of calls leads out of this handler, which projects an
answer depended on, and what the analysis could not see.

Two things shape everything else:

- **No LLM.** codedocs emits deterministic structured facts. Your own agent writes the prose. There
  is no provider, no API key and no inference cost anywhere in it.
- **The CLI is the product.** Every operation has a human renderer and a `--json` renderer over one
  fixed envelope. Agents use it by shelling out, the way this repo already uses `graphify` and
  `fallow`.

## Status

Pre-release, and not published to npm. Five operations, both renderers and the MCP server work end
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

| Operation           | Answers                                | Result unit |
| ------------------- | -------------------------------------- | ----------- |
| `analyse`           | build or refresh the index             | project     |
| `symbol <pattern>`  | every symbol whose name matches a glob | symbol      |
| `callers <subject>` | every call edge into a subject         | call edge   |
| `callees <subject>` | every call edge out of a subject       | call edge   |
| `trace <root>`      | every path of calls out of a root      | path        |

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

## For agents: one envelope, every answer

Pass `--json` and every operation returns the same shape, success or failure:

```console
$ codedocs callees 'packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData' --json
{
  "operation": "callees",
  "schemaVersion": 1,
  "request": {
    "subject": "packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData",
    "resolved": [
      "packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData"
    ],
    "limit": null,
    "depth": null
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
      "analysedAt": "2026-08-31T13:30:49.529Z"
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
parser never meets a second shape.

Four properties an agent can rely on:

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

## Flags

```
--json           machine output; unbounded unless --limit is given
--no-update      answer from the stored snapshot and name the drift
--limit <n>      cap results (human default 20, --json default none)
--depth <n>      `trace` only: cap the steps per path (default none)
--cwd <path>     run against another directory
--color / --no-color
```

Exit codes follow the `fallow` convention: **0** answered, **1** a negative finding, **2** could not
answer. Nothing produces 1 yet — ADR 0006 assigns it to `docs check` finding a contradicted claim and
to `doctor` finding an unmet precondition.

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

Implemented, covered by 155 tests, and measured against real repositories:

- **The index.** SQLite at `.codedocs/index.db`, one snapshot, every repeated string interned, and
  committed one project at a time — so an interrupted cold build leaves a partial index rather than
  nothing.
- **Five operations.** `analyse`, `symbol`, `callers`, `callees` and `trace`.
- **Two renderers over one envelope.** Human and `--json`, from the same operation. The operation set
  is held as data, so an operation cannot reach one renderer and miss the other.
- **Incremental repair.** Drift by stat and tree walk, and a signature-gated wave that propagates to
  direct importers only. The import graph follows every specifier form — `import`, `export`,
  `import()` and `import x = require()` — so a route or a lazily loaded component is not missed.
- **Two honesty channels.** Blind spots and truncation in the envelope, plus `conditions` narrowed to
  only the projects an answer touched.
- **Preflight, and the environment fingerprint.** All four of ADR 0001's signals: whether the
  dependencies are installed, whether an install script is declared, whether a config globs anything,
  and every specifier that resolved to nothing, each with the cause behind it. A project whose
  environment moved — an install landed, a codegen wrote the directory a tsconfig already globbed —
  is re-analysed rather than answered from facts extracted on a machine that is gone.
- **Symbol identity.** A descriptor path naming every enclosing scope, with the ids that still
  collide reported rather than silently merged.
- **An MCP server.** `codedocs mcp`, one tool per operation, derived from the manifest the CLI parser
  reads.

## What is left

**Operations settled in ADR 0006 and not implemented:** `references`, `file`, `evidence`,
`docs check`, `docs affected`, `doctor` and `report-bug`. The three composed operations — `impact`,
`review` and `plan` — come after those.

**Behind them, in rough order of how much they hold back:**

- **`doctor`**, which is what preflight is still missing. All four of ADR 0001's signals are
  measured and stored — `node_modules`, a declared install script, a config that globs nothing, and
  every unresolved specifier with its cause — and `analyse` and every answer report them. What has no
  home yet is `doctor --measure`, which re-runs the filesystem signals against the working tree and
  names where they disagree with the index, and the exit code that follows from a remediable cause.
- **Normalised SCIP symbol strings**, in place of today's descriptor path. Marked `TODO(#7)` in
  `model.ts`.
- **`codedocs.jsonc`**, so a repository can name projects discovery misses — and a rule about what is
  allowed to enter it. [#19](https://github.com/magicspon/codedocs/issues/19), marked `TODO(#19)` in
  `discovery.ts`.
- **The scope channel.** The third kind of honesty has no flag, and arrives with the label layer.
- **Exit code 1.** Nothing produces it yet; ADR 0006 assigns it to `docs check` finding a
  contradicted claim and to `doctor` finding an unmet precondition that has a remediation.
- **Agent discoverability**, the `AGENTS.md` block that tells an agent when to reach for codedocs.
  [#18](https://github.com/magicspon/codedocs/issues/18).
- **Publishing.** codedocs is not on npm, so today it is cloned and run from `node_modules/.bin`.

All open work lives in [GitHub issues](https://github.com/magicspon/codedocs/issues).

## Design documents

The architecture is written down before it is built, and the reasoning is usually more useful than
the code:

- **[`CONTEXT.md`](CONTEXT.md)** — the glossary. One meaning per term, and the words to avoid.
- **[`docs/adr/`](docs/adr)** — one ADR per hard-to-reverse decision: analysis preconditions, the
  internal representation, classification, index storage, document claims, the operation set,
  cross-commit continuity, baseline retention, and what preflight measures.
- **[`docs/research/`](docs/research)** — the measurements the ADRs rest on, including the call-graph
  backend spike that chose TypeScript 7 over TypeScript 6 on evidence.
- **[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)** — the original product requirements.

## Development

```sh
pnpm test         # vitest
pnpm typecheck    # tsc across the workspace
pnpm lint         # oxlint
pnpm check        # oxfmt --check && oxlint
pnpm format       # oxfmt && oxlint --fix
pnpm spell-check  # cspell
```

Every performance claim in this README is measured against fixture repositories cloned into `repos/`,
with full history so change-impact work has something real to read. That directory is gitignored, so
you will not have it after a clone — cal.com is the one the numbers above come from.
