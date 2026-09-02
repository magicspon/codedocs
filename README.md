# codedocs

A local codebase index for TypeScript, built for the questions an editor cannot answer.

Your editor tells you who calls one function, inside one project. codedocs indexes the whole
repository — every symbol, every call edge, every project — into a single SQLite file beside your
working tree, then answers questions **across** it, from the command line or from an agent.

```sh
codedocs callers 'AuthService.login'          # who calls this, from anywhere
codedocs trace 'handleCancelBooking.ts#handler' # what actually happens when this runs
codedocs impact --label role=test             # which tests does my change reach
codedocs docs check                           # which docs does my change contradict
```

No LLM, no API key, no network, no daemon. Every answer is deterministic, and every answer says what
the analysis could not see.

> **Pre-release.** Thirteen operations, both renderers and the MCP server work end to end on real
> repositories. The first npm release is pending; until it lands, install [from
> source](#from-source).

## Contents

- [Requirements](#requirements) · [Install](#install) · [Quick start](#quick-start)
- [Commands](#commands) — [analyse](#analyse) · [symbol](#symbol) · [callers / callees](#callers-and-callees) · [references](#references) · [file](#file) · [trace](#trace) · [evidence](#evidence) · [impact](#impact) · [docs check](#docs-check) · [docs affected](#docs-affected) · [doctor](#doctor) · [report-bug](#report-bug)
- [Naming a subject](#naming-a-subject) · [Filtering an answer](#filtering-an-answer) · [Flags](#flags) · [Exit codes](#exit-codes)
- [Configuration](#configuration) · [JSON output](#json-output) · [Using it from an agent](#using-it-from-an-agent)
- [Reading an answer honestly](#reading-an-answer-honestly) · [codedocs and fallow](#codedocs-and-fallow) · [Troubleshooting](#troubleshooting)

## Requirements

Node **24.19** or newer, and nothing else. The index is `node:sqlite` from the standard library, so
there is no native module to compile and no post-install step.

## Install

```sh
npm install -g @codedocs/cli
```

That puts a `codedocs` command on your `PATH`. The package is scoped because the unscoped `codedocs`
name on npm belongs to an unrelated project; the command it installs is `codedocs` either way.

Every command takes `--cwd`, so you never have to run codedocs from inside the repository it is
reading:

```sh
codedocs analyse --cwd /path/to/your/repo
```

The examples below are written as if you were standing in the repository being read.

### From source

```sh
git clone git@github.com:magicspon/codedocs.git
cd codedocs
pnpm install
pnpm build
./node_modules/.bin/codedocs analyse --cwd /path/to/your/repo
```

`pnpm build` is required here and not for a published install: Node refuses to strip types inside
`node_modules`, so what ships is a bundle and `bin` points into `dist/`.

## Quick start

**1. Build the index.** One row per TypeScript project, and totals underneath:

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

That is [cal.com](https://github.com/calcom/cal.com) — 4,827 files across 28 projects — in 17
seconds, for a 17 MB index.

**2. Ask.** You do not have to run `analyse` again. **Every command repairs the index before it
answers**, so an edit costs the repair (about 0.8 s for one file) and not a rebuild. A warm question
takes roughly 0.3 s including process start.

```console
$ codedocs symbol 'getPaymentAppData'
  packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData  function  packages/app-store/_utils/payments/getPaymentAppData.ts:11

$ codedocs callers 'getPaymentAppData' --limit 3
  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx#PaymentPage  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx:70
  apps/web/components/booking/BookingListItem.tsx#BookingListItem  apps/web/components/booking/BookingListItem.tsx:178
  apps/web/modules/bookings/components/AvailableTimes.tsx#SlotItem  apps/web/modules/bookings/components/AvailableTimes.tsx:105

  showing 3 of 14 — pass --limit for more
```

`analyse` exists so a cold build in CI can be a step that fails on its own, rather than a hidden cost
inside the first question.

There is no daemon and no watcher. Each command is a one-shot process.

## Commands

| Command                | Answers                                                       | Result unit    |
| ---------------------- | ------------------------------------------------------------- | -------------- |
| `analyse`              | build or refresh the index                                    | project        |
| `symbol <pattern>`     | every symbol whose name matches a glob                        | symbol         |
| `callers <subject>`    | every call edge into a subject                                | call edge      |
| `callees <subject>`    | every call edge out of a subject                              | call edge      |
| `references <subject>` | everything that names a subject without calling it            | reference edge |
| `file <path>`          | what the index holds about one file                           | file           |
| `trace <root>`         | every path of calls out of a root                             | path           |
| `evidence <subject>`   | everything the index holds about one subject                  | per kind       |
| `impact`               | every symbol a change could reach, against an earlier commit  | symbol         |
| `docs check`           | which documented claims the code now contradicts              | document       |
| `docs affected`        | which documents a change reaches                              | document       |
| `doctor`               | every unmet precondition, and the command that would clear it | precondition   |
| `report-bug`           | a reproduced failure, safe to paste                           | —              |

### analyse

Build the index, or bring it up to date. Reports what it did — a cold build, a repair, or nothing —
and captures a [baseline](#impact) if the tree is clean.

```sh
codedocs analyse
codedocs analyse --limit 40      # show more than the default 20 projects
```

### symbol

Find a symbol when you do not know its path. The only command that takes a glob, matched against both
the declared name and the qualified name:

```sh
codedocs symbol 'AuthService.login'
codedocs symbol '*Repository'
codedocs symbol '*'              # everything
```

It does no ranking, ever. Results are sorted, never scored.

### callers and callees

```console
$ codedocs callers 'getPaymentAppData' --limit 5
  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx#PaymentPage  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx:70
  apps/web/components/booking/BookingListItem.tsx#BookingListItem  apps/web/components/booking/BookingListItem.tsx:178
  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx#BookEventForm  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx:83
  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx#BookEventForm  apps/web/modules/bookings/components/BookEventForm/BookEventForm.tsx:89

  showing 4 of 14 — pass --limit for more
```

The same caller twice is not a duplicate — those are two call sites, each with its own `file:line`.
Calls that go through barrel files and renamed re-exports are followed to the real declaration.

### references

Everything that **names** a subject without calling it — a type in a signature, a class in an
`extends`, a value passed by name. `callers` cannot see any of it.

```sh
codedocs references 'Money'
```

Four kinds are kept apart: `extends`, `implements`, `typeReferences`, and plain `references`. A call
is never also a reference, and an import is neither — that is already an `imports` edge on the file.

Both directions come back in one answer: "what names `Money`" and "what does `price` name" are the
same edge read from two ends.

### file

What the index holds about one file, without having to guess a symbol name first:

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

It takes a repository-relative path or the tail of one, so `codedocs file types.ts` finds the same
file. The `*` marks the canonical project — the one the file's facts were produced in, and so the one
whose fidelity applies.

### trace

The one no editor offers. `trace` walks outward from a root and returns **paths**, drawn as a tree
with each shared prefix collapsed onto the line before it:

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
          → packages/features/flags/features.repository.ts#FeaturesRepository  packages/emails/templates/_base-email.ts:33
          → packages/features/flags/features.repository.ts#FeaturesRepository.checkIfFeatureIsEnabledGlobally  packages/emails/templates/_base-email.ts:34

  showing 8 of 250 — pass --limit for more
```

Eight paths, five files, and the shape of what cancelling a booking actually does — including that
sending one email reads a feature flag.

Three things worth knowing:

- **`--limit` counts paths, not lines.** These eight paths draw thirteen steps, because a shared
  prefix is printed once.
- **The walk is unbounded unless you bound it** with `--depth`. Where `--depth` cut a branch, that
  branch says so (`⇣ more calls beyond depth 3`), so a bounded answer can never be read as a whole
  one.
- **Cycles terminate and are reported**, marked `↺ cycle` on the step that closed the loop.

### evidence

Every kind of fact the index holds about one subject, in one answer — so an agent, or a person,
writing a document has them all without asking six questions:

```console
$ codedocs evidence 'scopeTo' --limit 3
  symbols (1)
    packages/core/src/operations/scope.ts#scopeTo  function  packages/core/src/operations/scope.ts:31
  files (1)
    packages/core/src/operations/scope.ts  typed
      in packages/cli/tsconfig.json *
      imports (3)
        ../envelope.ts → packages/core/src/envelope.ts
        ../model.ts → packages/core/src/model.ts
        ../store/index.ts → packages/core/src/store/index.ts
  callers (showing 3 of 6)
    packages/core/src/operations/calls.ts#collect  packages/core/src/operations/calls.ts:98
    packages/core/src/operations/file.ts#file  packages/core/src/operations/file.ts:75
    packages/core/src/operations/impact.ts#impact  packages/core/src/operations/impact.ts:145
  callees (3)
    …
  labels (3)
    packages/core/src/operations/scope.ts  role=source  [inferred: default]
    packages/core/src/operations/scope.ts  authorship=authored  [deterministic: git-untracked]

  showing 14 of 19 — pass --limit for more
```

It generates nothing — there is no prose here, and never will be. `--limit` applies **per kind**, and
each kind reports its own truncation, so a fourth caller cannot quietly evict the file or the labels.

`--claims` (with `--json`) restates the facts as claim expressions, so an agent writing a document
never has to invent the syntax:

```console
$ codedocs evidence 'scopeTo' --claims --json | jq -r '.claims[0:3][]'
exists(packages/core/src/operations/scope.ts#scopeTo)
imports(packages/core/src/operations/scope.ts, packages/core/src/envelope.ts)
imports(packages/core/src/operations/scope.ts, packages/core/src/model.ts)
```

### impact

What a change could reach: a walk **inward** through call and reference edges, from the symbols your
working tree edited.

```console
$ codedocs impact --depth 2
  changed
    src/core.ts#core
  1 step out
    src/uses.ts#uses  calls
  2 steps out
    src/outer.ts#outer  calls

  1 file changed:
    src/core.ts (changed)

  compared against fb130c4
```

```sh
codedocs impact                        # against the merge base with the default branch
codedocs impact --base main            # against a named commit
codedocs impact --label role=test      # which tests does this change reach
```

**Which tests does this change reach** is `impact --label role=test`. There is no `affected-tests`
command and there will not be one — a second traversal is a second thing to keep correct.

`impact` compares against a **baseline**: an index codedocs kept from a commit it once analysed.
Baselines are recorded as a side effect of `analyse` over a clean tree, never built on demand, and
never leave the machine. Three are kept. If there is no usable baseline, the answer still comes back
— the edits still come from git and the walk still runs — with the missing comparison named as a
blind spot at exit 0.

### docs check

A **document** is any Markdown file in the repository carrying at least one **claim**: a checkable
assertion written in an HTML comment, immediately after the prose it justifies. It is invisible on
GitHub and in every editor preview, and plain text in a diff.

```markdown
Checkout charges through the payment service before it writes the order.

<!-- codedocs: calls(src/checkout/service.ts#CheckoutService.charge,
                     src/payments/service.ts#PaymentService.capture) -->
```

Writing a claim is how a file opts in. There is no configuration and no `docs/**` convention —
discovery is a repository-wide scan for the marker, 46 ms over cal.com's 380 Markdown files.

```console
$ codedocs docs check
  docs/payments.md  contradicted, 3 of 5 sections covered
    Charging  verified  :6
      calls(src/payments.ts#charge, src/payments.ts#audit)  verified  :10
    Gateways  contradicted  :17
      implementations(src/types.ts#Gateway) == 3  contradicted  (index holds 2)  :21
    Links  contradicted  :24
      ../src/gone.ts → no such file  :26

  scanned 33 Markdown files in 3 ms, finding 1 document
```

**The predicates**, a closed set: `exists`, `calls`, `reaches`, `references`, `imports`, `extends`,
`implements`, `usesType` and `hasLabel`; negation (`!calls(a, b)`); the scoped `onlyCalledBy(x,
dir/)`; and counts (`implementations(x) == 3`, `callers(x) == 0`), which catch a fourth implementation
being added as no per-instance claim ever will.

**Four verdicts**, each with exactly one producer. Nothing blends them, and there is no score.

| Verdict             | Means                                                      |
| ------------------- | ---------------------------------------------------------- |
| `verified`          | every claim in the document checks out                     |
| `contradicted`      | a claim is falsified, or a prose link names no file        |
| `potentially stale` | every claim holds, and a file the document touches changed |
| `unable to verify`  | the subject is in a `syntactic` file, or did not resolve   |

A vanished symbol is `unable to verify`, never `contradicted` — and the answer carries rename
candidates (_"a symbol of that name is now at `src/new.ts#relocated`, moved in `ab21c7f`"_), which is
the text you need to repair the claim.

**Only `contradicted` exits 1**, plus an error in the document itself. `potentially stale` does not:
signals of that character measure at 59–77% false alarms, and wiring one to a red build is how this
gets removed from CI within a month. Raise the bar with `--fail-on <verdict>` if you want it.

codedocs never writes to a document — no verification stamp, and no unattended repair after a rename.

### docs affected

The change half of the same question, and it needs no baseline:

```sh
codedocs docs affected              # what have I broken right now
codedocs docs affected --base main  # everything since this commit
```

With no argument the changed set is the drift codedocs already computes before every answer, so it
needs no git and no configuration — usable inside a pre-commit hook. It never exits 1: reaching a
document is not a finding.

### doctor

Every unmet precondition in the repository, grouped so that one cause is one finding:

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

- **Static and instant.** It renders what the index already stored. No program is opened and no sweep
  of its own runs.
- **A remediation, or an honest silence.** An install command is read from the lockfile and a codegen
  command from [`codedocs.jsonc`](#configuration). `unmapped` and `broken` get no command — none
  would help the first, and none _is_ a command for the second.
- **`--measure`** re-runs the filesystem signals against the working tree and names where they
  disagree with the index. It is the escape hatch for the one thing stored signals cannot see: an
  install that is present and incomplete.

`doctor` exits 1 for a cause a command would clear, and never for `unmapped` or `broken` — a red
build that cannot be cleared is noise.

### report-bug

Reproduce a failing command and write one file you can attach to an issue:

```sh
codedocs report-bug -- callers 'Thing.method'
codedocs report-bug --with-repository -- trace 'src/app.ts#main'
codedocs report-bug --out - -- doctor          # to stdout
```

The default report carries facts about codedocs and your machine alone, so it is **safe to paste in
public unread**. `--with-repository` adds the facts that name your code. Nothing is logged and
nothing is transmitted — codedocs writes the file, and you decide where it goes.

## Naming a subject

Whatever codedocs prints as an identifier, it accepts as input. Two forms:

```
packages/app-store/_utils/payments/getPaymentAppData.ts#getPaymentAppData   exact
getPaymentAppData                                                          may match several
```

An ambiguous name is **not an error**. The answer covers every symbol it matched, and
`request.resolved` names them — making you ask again costs a round trip to learn something the answer
already contains.

Start from `symbol` when you do not know the path.

## Filtering an answer

Every file carries two labels, on axes that are deliberately independent:

- `role` — `source`, `test` or `config`
- `authorship` — `authored` or `generated`

Filter any answer with the same generic pair, rather than bespoke flags like `--no-tests`:

```console
$ codedocs callers charge --exclude-label role=test
  …
  scope authorship=authored, not role=test — 4 excluded by it
```

- **The default scope is `authorship=authored`, with no filter on `role`.** Test callers stay in by
  default: hiding them makes tested-but-unreferenced code look dead.
- **`--label` on an axis replaces the default for that axis alone**, so `--label
authorship=generated` asks about exactly what the default hides.
- **An exclusion is a count, never a blind spot.** codedocs knows exactly what it withheld, and the
  applied scope is echoed on every answer.

Both flags are repeatable, one per axis.

## Flags

```
--json           machine output; unbounded unless --limit is given
--no-update      answer from the stored snapshot and name the drift
--limit <n>      cap results (human default 20, --json default none)
--depth <n>      `trace`, `impact` only: cap the steps per path (default none)
--cwd <path>     run against another directory
--color / --no-color

--label <axis>=<value>          keep only results whose file carries it
--exclude-label <axis>=<value>  drop results whose file carries it

`evidence` only:
  --claims             restate the facts as claim expressions (--json only)

`docs check` only:
  --fail-on <verdict>  also exit 1 for this verdict (default: contradicted alone)

`docs affected` only:
  --base <ref>         widen the changed set to everything since this commit

`impact` only:
  --base <ref>         the commit to compare against (default: the merge base)

`doctor` only:
  --measure            check the signals against the working tree

`report-bug` only:
  --with-repository    add the facts that name your code
  --out <path>         where to write it; `-` is stdout (default ./codedocs-report.json)
```

A per-command flag passed to another command is **refused**, never ignored: `callers --depth 2` is an
error, because otherwise you would read a one-hop answer as a bounded walk.

## Exit codes

| Code | Means              | Produced by                                                      |
| ---- | ------------------ | ---------------------------------------------------------------- |
| `0`  | answered           | everything                                                       |
| `1`  | a negative finding | `doctor` (a clearable precondition), `docs check` (contradicted) |
| `2`  | could not answer   | a bad command line, an invalid config, an unreadable index       |

The convention matches [`fallow`](#codedocs-and-fallow), so both can sit in the same CI script.

## Configuration

Optional. `codedocs.jsonc` at the repository root holds the facts about a repository codedocs cannot
determine and must be told. Every key has a default, so a fresh clone needs no file at all.

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
walk already found; `discover.skip` is added to the skip list, so `node_modules` cannot be removed
from it. Neither decides membership: a file is in the index if and only if a project globs it.

**It holds facts, never preferences.** A default `--limit`, an output format, a colour setting —
codedocs can determine all of them, so none may enter. Nor may a key change what is _reported_ about
what was analysed: no blind spot, truncation, fidelity or provenance can be configured away.

**Parsing is strict.** Comments and trailing commas are read, as `.jsonc` promises. A file that is
absent is normal and silent; a file that exists and is wrong exits 2 naming the file, the key and what
was expected, and never falls back to the defaults. An unknown key is an error, naming a near
neighbour where there is one — `exlucde` parsing to nothing, silently, is the failure this buys out.

<!-- cspell:ignore exlucde -->

## JSON output

Pass `--json` and every command returns the same shape, success or failure. This is what CI, a script
and an agent all read — there is no separate agent surface.

```jsonc
{
  "operation": "callees",
  "schemaVersion": 4,
  "request": {
    "subject": "…#getPaymentAppData",
    "resolved": [
      "codedocs npm @calcom/app-store . `…/getPaymentAppData.ts`/getPaymentAppData().",
    ],
    "limit": null,
    "depth": null,
    "scope": {
      "include": [{ "axis": "authorship", "value": "authored" }],
      "exclude": [],
      "excluded": 0,
    },
  },
  "snapshot": {
    "commit": "176037d0…",
    "dirty": false,
    "analysedAt": "2026-08-31T13:30:49.529Z",
  },
  "conditions": [
    {
      "project": "apps/api/v2/tsconfig.json",
      "fidelity": "typed",
      "cause": null,
      "postinstall": false,
    },
  ],
  "blindSpots": [],
  "budget": { "returned": 1, "available": 1, "truncated": false },
  "result": [
    {
      "from": "…/getPaymentAppData().",
      "to": "…/getEventTypeAppData.",
      "attribution": "symbol",
      "file": "packages/app-store/_utils/payments/getPaymentAppData.ts",
      "line": 58,
      "provenance": "deterministic",
      "derivation": "checker-signature",
    },
  ],
}
```

Only `result` differs between commands. A failure carries `error` **instead of** `result`, so a
parser never meets a second shape:

```jsonc
"error": {
  "code": "config-invalid",
  "params": { "key": "exlucde", "expectation": "is not a key codedocs knows — did you mean `exclude`?" },
}
```

An error is a **code and typed parameters, never a sentence**. Branch on `code` — it is a closed set —
rather than matching English that may be reworded.

Four things you can rely on:

- **`request.resolved` echoes what your subject became**, which is how you feed an answer back in. A
  terminal prints the shorthand (`path.ts#Descriptor.path`) and `--json` prints the full
  [SCIP](https://github.com/scip-code/scip) symbol string; **both are accepted as a subject**.
- **A total order, sorted on the data.** The same commit rebuilt gives byte-identical output, given
  the same environment and tool version.
- **`--json` is explicit and unbounded by default.** It is never inferred from a TTY: sniffing a pipe
  makes the same command behave differently depending on where it runs, and a capped answer an agent
  reads as whole is a wrong answer with a footnote.
- **`--limit`'s default belongs to the renderer.** Humans get 20 and a note saying how many were
  withheld; `--json` gets everything.

## Using it from an agent

Two ways, and they return the same bytes.

**Shell out** to `codedocs <command> --json` and parse the envelope above.

**Or speak MCP.** `codedocs mcp` serves the same commands over stdio:

```json
{
  "mcpServers": {
    "codedocs": {
      "command": "codedocs",
      "args": ["mcp"]
    }
  }
}
```

One tool per command, same name, same arguments, returning the envelope verbatim — and no tool that
is not a command. `docs check` is published as `docs_check`, because a tool name may not carry a
space.

`evidence` is the command written for this: it hands over every fact the index holds about a subject
in one call, and `--claims` gives back the claim syntax for writing the result into a document that
`docs check` will then keep honest.

## Reading an answer honestly

An answer that cannot say what it missed is worse than no answer. codedocs separates three things
that are usually blurred into one score, and every answer carries all three:

| Channel        | Means                    | Does codedocs know what it missed? |
| -------------- | ------------------------ | ---------------------------------- |
| **Blind spot** | could not see it         | no — that is why it is named       |
| **Truncation** | withheld it deliberately | yes, exactly                       |
| **Scope**      | you excluded it          | it was part of the question        |

`conditions` carries the **fidelity** of only the projects your answer touched — `typed` where the
type checker ran, `syntactic` where a precondition was unmet. Fidelity is never a percentage and never
a grade: it says which analysis ran, not how good your code is.

**codedocs never executes your repository's code**, under any flag. A missing install or an un-run
codegen step lowers a file's fidelity and names the cost, rather than being fixed behind your back.
Run `codedocs doctor` to see what would clear it.

## codedocs and fallow

[`fallow`](https://docs.fallow.tools) reads a repository's text and reports its hygiene.
codedocs resolves its symbols and reports its relationships. **codedocs implements no analysis
`fallow` already ships** — not because the overlap would be hard, but because two tools answering one
question about one repository will disagree, and you would have no way to decide which is right.

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

## Troubleshooting

**Everything says `syntactic`.** A precondition is unmet — usually an install that has not run, or a
codegen step. `codedocs doctor` names each one and the command that would clear it. codedocs will not
run your install for you.

**A `missing-generated` specifier has no remediation.** codedocs ships with no built-in framework
table, so it will not guess a codegen command. Tell it once in
[`codedocs.jsonc`](#configuration) under `remediations`.

**The first question after `git pull` is slow.** That is the repair, and it is doing the work
`analyse` would have done. Put `codedocs analyse` in your post-checkout hook or your CI setup step if
you would rather pay it visibly.

**A symbol I can see is not in the index.** A file is in the index if and only if a `tsconfig` globs
it. Check with `codedocs file <path>` — `matched no file` means no project globs it, so add the
project under `discover.projects`.

**I want to force a cold build.** Delete `.codedocs/`. It is a derived artefact and always safe to
remove — codedocs recreates it, `.gitignore` and all.

**An answer looks wrong.** `codedocs report-bug -- <the command that failed>` reproduces it and
writes a file you can attach to an issue. The default shape names nothing about your code.

**Should I commit `.codedocs/`?** No. It is binary, so git cannot delta it: six commits of about a
hundred rows grew `.git` by 25 MB in testing.

## Where the design lives

The architecture is written down before it is built, and the reasoning is usually more useful than the
code:

- **[`docs/solution.md`](docs/solution.md)** — how codedocs works: the two packages, the path of one
  command, the index, and the map of the source tree.
- **[`CONTEXT.md`](CONTEXT.md)** — the glossary. One meaning per term, and the words to avoid.
- **[`docs/adr/`](docs/adr)** — one ADR per hard-to-reverse decision: analysis preconditions, the
  internal representation, classification, index storage, document claims, the operation set,
  cross-commit continuity, baseline retention, what preflight measures, what may enter the
  configuration file, what a bug report may carry, and where codedocs stops and `fallow` starts.
- **[`docs/research/`](docs/research)** — the measurements the ADRs rest on.
- **[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)** — what codedocs is for, who it is for, and what
  it will not do.

Open work lives in [GitHub issues](https://github.com/magicspon/codedocs/issues).

## Development

```sh
pnpm test           # vitest
pnpm test:coverage  # vitest with v8 coverage, against the thresholds in vitest.config.ts
pnpm typecheck      # tsc across the workspace
pnpm lint           # oxlint
pnpm check          # oxfmt --check && oxlint
pnpm check:network  # no package reaches the network, over the dependency closure
pnpm format         # oxfmt && oxlint --fix
pnpm spell-check    # cspell
```

Every performance claim in this README is measured against fixture repositories cloned into `repos/`,
with full history. That directory is gitignored, so you will not have it after a clone — cal.com is
the one the numbers above come from.

## Licence

[MIT](LICENSE)
