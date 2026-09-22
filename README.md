> [!CAUTION]
> This is currently pre-alpha and unreleased. It uses the unstable TypeScript 7 API.

> [!IMPORTANT]
> This started as an idea over a beer and a conversation with ChatGPT. We wrote the requirements, I used Matt Pocock's Wayfinder skill to turn them into ADRs, and then Claude Code built it. I have not written a line of the implementation myself. I'm now having to learn what I apparently asked it to build.
>
> The architecture and reasoning are documented in [`docs/`](docs/), so if you're interested in how it works, that's the place to start.

# codedocs

**A deterministic structural index for TypeScript repositories.**

Your editor is excellent at navigating local code. `codedocs` answers questions about the **structure of an entire repository** — across files, projects and packages.

It indexes symbols, calls, references, files and projects into a local SQLite database, then lets you query the resulting graph from the command line or from an agent.

```sh
codedocs callers 'AuthService.login'
codedocs trace 'handleCancelBooking.ts#handler'
codedocs impact --label role=test
codedocs docs check
```

No LLM. No API key. No network. No daemon.

The answers are deterministic, reproducible and explicit about what the analysis could not see.

> **Pre-release:** 14 operations, both renderers and the MCP server currently work end to end on real repositories.

---

## Why codedocs?

Text search tells you where something is mentioned.

An editor can navigate from a symbol to its definition and, usually, its immediate references.

But some questions are fundamentally **repository-wide structural questions**:

- What calls this function from another package?
- What are all the paths out of this handler?
- What does this change reach?
- Which tests can this change reach?
- What types and implementations depend on this interface?
- Which documentation claims are now contradicted by the code?

Those are questions about relationships, not text.

`codedocs` builds those relationships once and lets you query them.

---

## Quick start

### 1. Install

Requires **Node 24.19+**.

```sh
npm install -g @codedocs/cli
```

The command is simply:

```sh
codedocs
```

Every command accepts `--cwd`, so you can query another repository without changing directory:

```sh
codedocs analyse --cwd /path/to/repository
```

### 2. Analyse a repository

```sh
codedocs analyse
```

For example, analysing cal.com:

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

That repository contains 4,827 TypeScript files across 28 projects. The cold analysis took about 17 seconds and produced a 17 MB index.

### 3. Ask questions

Once the index exists, commands keep it up to date automatically.

```console
$ codedocs callers 'getPaymentAppData'
  apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx#PaymentPage
  apps/web/components/booking/BookingListItem.tsx#BookingListItem
  apps/web/modules/bookings/components/AvailableTimes.tsx#SlotItem
  ...

  showing 3 of 14 — pass --limit for more
```

A warm query takes roughly 300 ms including process startup.

There is no daemon and no watcher. Every command is a one-shot process.

---

# Commands

| Command                | Answers                                                |
| ---------------------- | ------------------------------------------------------ |
| `analyse`              | Build or refresh the index                             |
| `symbol <pattern>`     | Find symbols by name                                   |
| `callers <subject>`    | What calls this?                                       |
| `callees <subject>`    | What does this call?                                   |
| `references <subject>` | What structurally references this?                     |
| `file <path>`          | What does codedocs know about this file?               |
| `trace <root>`         | What statically reachable call paths lead out of this? |
| `evidence <subject>`   | What facts does the index hold about this subject?     |
| `impact`               | What does this change reach?                           |
| `docs check`           | Which documented claims contradict the code?           |
| `docs affected`        | Which documents are reached by a change?               |
| `docs draft <subject>` | Create a fact-filled documentation draft               |
| `doctor`               | What analysis preconditions are unmet?                 |
| `report-bug`           | Produce a reproducible bug report                      |

The commands are deliberately composable. There isn't a separate "AI mode" or a different API for agents.

`symbol`, `callers`, `callees`, `references`, `file` and `evidence` take more than one subject in a single call — `codedocs evidence 'AuthService.login' 'SessionService.refresh'` — so an agent that already has a list of symbols pays one round trip and one envelope instead of one per symbol. See [JSON](#json) below for the shape this returns.

---

## `symbol`

Find a symbol when you don't know its path.

```sh
codedocs symbol 'AuthService.login'
codedocs symbol '*Repository'
codedocs symbol '*'
```

Matching is against both the declared name and qualified name.

There is no ranking or scoring. Results are sorted.

If a name is ambiguous, codedocs does not make you resolve it first. It returns every match and records what the subject resolved to.

---

## `callers` and `callees`

Ask either direction of the call graph.

```sh
codedocs callers 'getPaymentAppData'
codedocs callees 'getPaymentAppData'
```

Calls through barrel files and renamed re-exports are followed to their declarations.

Call sites remain distinct, so two calls from the same function are two results.

---

## `references`

Calls aren't the only useful relationship.

```sh
codedocs references 'Money'
```

References include:

- `extends`
- `implements`
- `typeReferences`
- plain `references`

Imports are kept separate because they are file-level relationships.

This lets you ask questions such as:

> What depends on this type, rather than what calls this function?

---

## `trace`

`trace` walks outward through the call graph and returns paths.

```console
$ codedocs trace 'handleCancelBooking.ts#handler' --limit 8
  handleCancelBooking.ts#handler
    → email-manager.ts#sendCancelledEmailsAndSMS
      → email-manager.ts#sendEmail
        → _base-email.ts#BaseEmail.sendEmail
          → sanitizeDisplayName.ts#sanitizeDisplayName
            → sanitizeDisplayName.ts#sanitize
          → _base-email.ts#BaseEmail.getMailerOptions
          → features.repository.ts#FeaturesRepository
          → features.repository.ts#FeaturesRepository.checkIfFeatureIsEnabledGlobally

  showing 8 of 250 — pass --limit for more
```

This is not an execution trace. It is a **static traversal of the relationships codedocs could establish**.

Three details matter:

- `--limit` counts paths, not printed lines.
- `--depth` bounds the traversal and explicitly reports where branches were cut.
- Cycles terminate and are reported as `↺ cycle`.

If analysis could not establish a relationship, the answer says so rather than pretending the graph is complete.

---

## `impact`

Ask what a change could reach.

```sh
codedocs impact
codedocs impact --base main
codedocs impact --label role=test
```

For example:

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

The same traversal can answer:

> **Which tests does this change reach?**

```sh
codedocs impact --label role=test
```

There is deliberately no separate `affected-tests` operation.

`impact` uses a baseline captured when `analyse` runs on a clean tree. Baselines stay local and are never transmitted.

---

## `evidence`

`evidence` is the broadest query for one subject.

```sh
codedocs evidence 'scopeTo'
```

It can return:

- symbols
- files
- callers
- callees
- references
- imports
- labels
- provenance
- analysis conditions

An agent can therefore ask one question and receive the facts codedocs already has, rather than rediscovering them through several searches.

With `--claims --json`, those facts can also be expressed using the same claim syntax understood by `docs check`.

---

# Documentation that can be checked

One unusual feature of codedocs is that documentation can contain **machine-checkable claims**.

A Markdown file becomes a codedocs document simply by containing a claim:

```markdown
Checkout charges through the payment service before it writes the order.

<!-- codedocs: calls(src/checkout/service.ts#CheckoutService.charge,
                     src/payments/service.ts#PaymentService.capture) -->
```

The prose remains normal Markdown. The claim is invisible in GitHub and editor previews.

Then:

```sh
codedocs docs check
```

can tell you whether the documented relationship still exists.

Supported predicates include:

```text
exists
calls
reaches
references
imports
extends
implements
usesType
hasLabel
```

as well as negation, scoped callers and counts.

### Four possible verdicts

| Verdict             | Meaning                                                  |
| ------------------- | -------------------------------------------------------- |
| `verified`          | Every claim holds                                        |
| `contradicted`      | A claim is false, or a referenced file no longer exists  |
| `potentially stale` | Claims hold, but relevant code changed                   |
| `unable to verify`  | The required symbol or analysis could not be established |

A vanished symbol is **not** automatically treated as a contradiction. If codedocs can find a plausible relocation, it reports that instead.

By default, only `contradicted` produces exit code 1.

The important rule is that codedocs **never silently turns uncertainty into failure**.

---

# Documentation drafts

```sh
codedocs docs draft 'CheckoutService.charge'
```

creates a Markdown document containing facts from the index.

It does **not** invent prose.

It does **not** create endorsed claims.

Candidate claims are marked:

```markdown
<!-- codedocs?: exists(...) -->
```

Changing `codedocs?:` to `codedocs:` is the explicit act of endorsing the claim.

This keeps the distinction between:

> **codedocs knows this fact**

and:

> **the author says this fact explains the code**

---

# Honest answers

Static analysis is never omniscient.

codedocs therefore separates three different reasons an answer may be incomplete:

| Signal         | Meaning                                |
| -------------- | -------------------------------------- |
| **Blind spot** | codedocs could not establish something |
| **Truncation** | you deliberately limited the answer    |
| **Scope**      | you deliberately excluded something    |

These are not collapsed into a confidence score.

Every answer also carries the analysis **fidelity** of the projects involved:

- `typed` — TypeScript's type checker was available
- `syntactic` — codedocs could only perform syntactic analysis

A missing dependency or generated file does not get silently repaired.

Run:

```sh
codedocs doctor
```

to find out what is preventing typed analysis.

The principle is simple:

> **An answer that cannot say what it missed is worse than no answer.**

---

# Labels

Files have two independent classification axes:

```text
role        source | test | config
authorship  authored | generated
```

The default scope is:

```text
authorship=authored
```

with no restriction on `role`.

So tests remain visible by default.

You can change the scope on any query:

```sh
codedocs callers charge --exclude-label role=test
codedocs evidence scopeTo --label authorship=generated
```

Excluded results are counted and reported rather than disappearing silently.

---

# JSON

Every operation supports:

```sh
--json
```

Every command returns one of two envelope shapes, and which one follows from the operation, never from how it was invoked.

Most operations — `analyse`, `trace`, `impact`, `docs check`, `docs affected`, `docs draft`, `doctor`, `report-bug` — return the flat envelope below:

```json
{
  "operation": "trace",
  "schemaVersion": 5,
  "request": {
    "subject": "…#getPaymentAppData",
    "resolved": ["…#getPaymentAppData"],
    "limit": null,
    "depth": null,
    "scope": {
      "include": [{ "axis": "authorship", "value": "authored" }],
      "exclude": [],
      "excluded": 0
    }
  },
  "snapshot": {
    "commit": "176037d0…",
    "dirty": false
  },
  "conditions": [],
  "blindSpots": [],
  "budget": {
    "returned": 1,
    "available": 1,
    "truncated": false
  },
  "result": []
}
```

`symbol`, `evidence`, `callers`, `callees`, `references` and `file` take one or more subjects in a single call, and `result` is always an array keyed by subject — one entry whether one subject was given or many, so an agent that names several symbols pays one round trip and one envelope rather than one of each per symbol. `budget` and `blindSpots` have no top-level field on this shape: each entry owns its own, so a shared pool can never let one subject's answer evict another's.

```sh
codedocs callees 'getPaymentAppData' 'chargePayment' --json
```

```json
{
  "operation": "callees",
  "schemaVersion": 5,
  "request": {
    "subjects": ["getPaymentAppData", "chargePayment"],
    "resolved": [
      { "subject": "getPaymentAppData", "resolved": ["…#getPaymentAppData"] },
      { "subject": "chargePayment", "resolved": ["…#chargePayment"] }
    ],
    "limit": null,
    "depth": null,
    "scope": {
      "include": [{ "axis": "authorship", "value": "authored" }],
      "exclude": []
    }
  },
  "snapshot": {
    "commit": "176037d0…",
    "dirty": false
  },
  "conditions": [],
  "result": [
    {
      "subject": "getPaymentAppData",
      "resolved": ["…#getPaymentAppData"],
      "budget": { "returned": 0, "available": 0, "truncated": false },
      "excluded": 0,
      "blindSpots": [],
      "result": []
    },
    {
      "subject": "chargePayment",
      "resolved": ["…#chargePayment"],
      "budget": { "returned": 2, "available": 2, "truncated": false },
      "excluded": 0,
      "blindSpots": [],
      "result": [
        { "from": "…#chargePayment", "to": "…#audit", "kind": "calls" },
        { "from": "…#chargePayment", "to": "…#post", "kind": "calls" }
      ]
    }
  ]
}
```

A single subject still comes back the same way — `result` has exactly one entry — so a caller never has to branch on how many subjects it happened to pass.

Failures use the same envelope (whichever of the two shapes the operation carries) with `error` instead of `result`.

Errors are represented by stable error codes and typed parameters rather than human-readable sentences, so consumers should branch on `error.code`, not English text.

JSON output is **unbounded by default**. `--limit` must be explicit.

---

# Using codedocs from an agent

There is no special agent implementation.

An agent can either shell out:

```sh
codedocs callers 'Thing.method' --json
```

or use MCP:

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

MCP exposes the same operations and returns the same JSON envelopes.

This is intentional.

The useful abstraction isn't "an AI tool". It is a **deterministic structural interface to a repository** that happens to be useful to both humans and agents.

See [`docs/agent-guide.md`](docs/agent-guide.md) for the recommended investigation workflow.

---

# Configuration

Most repositories need no configuration.

An optional `codedocs.jsonc` can provide facts that codedocs cannot infer:

```jsonc
{
  "version": 1,
  "classify": {
    "vendor/**": {
      "authorship": "generated",
    },
  },
  "baselines": 3,
  "discover": {
    "projects": ["packages/*/tsconfig.build.json"],
    "skip": ["repos"],
  },
  "remediations": [
    {
      "specifier": "@calcom/prisma/*",
      "run": "pnpm prisma generate",
    },
  ],
}
```

Configuration describes **facts about the repository**, not presentation preferences.

It cannot turn off blind spots, alter fidelity, or configure away uncertainty.

The file is parsed strictly. Unknown keys and invalid values are errors.

---

# Exit codes

| Code | Meaning          |
| ---- | ---------------- |
| `0`  | Answered         |
| `1`  | Negative finding |
| `2`  | Could not answer |

`1` is used by findings such as a contradicted document or a clearable `doctor` precondition.

`2` means the command itself could not produce an answer — for example, invalid configuration or an unreadable index.

---

# `doctor`

When analysis cannot use TypeScript's full type information:

```sh
codedocs doctor
```

reports the cause and, where possible, the command that would clear it.

For example:

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
```

`doctor` does not execute those commands.

With:

```sh
codedocs doctor --measure
```

it can additionally compare the stored signals with the current filesystem.

---

# `report-bug`

When something looks wrong:

```sh
codedocs report-bug -- callers 'Thing.method'
```

creates a reproducible report.

By default it contains information about codedocs and the machine, but not your repository.

If you explicitly want repository facts:

```sh
codedocs report-bug --with-repository -- trace 'src/app.ts#main'
```

Nothing is transmitted automatically.

---

# `codedocs art`

Draws the index as an interactive 3D city and galaxy:

```sh
codedocs art
```

This writes `.codedocs/art/index.html`. Open it in a browser. It is one file, and it makes no network requests.

Each shape stands for a fact about the code. For example, a building's footprint is the file's size, and its height is how many symbols it declares.

To watch the repository grow, add `--frames` to replay that many commits from its history:

```sh
codedocs art --frames 16
```

- Each commit is checked out into a temporary git worktree, then removed. Your working tree is never touched.
- Frames are cached in `.codedocs/art/cache`, so a later run only analyses new commits.
- A later run without `--frames` keeps the timeline you already built.

If [`fallow`](https://docs.fallow.tools) is on your `PATH`, the art also shows its health readings, such as hotspots and hard-to-change files. Add `--no-fallow` to skip them.

---

# codedocs and fallow

codedocs deliberately does not try to become a general-purpose repository analyser.

[`fallow`](https://docs.fallow.tools) answers questions about repository hygiene and code health.

codedocs answers questions about **structural relationships**.

| Question                                             | Tool                                |
| ---------------------------------------------------- | ----------------------------------- |
| Is this export unused?                               | `fallow dead-code`                  |
| Are there import cycles?                             | `fallow dead-code`                  |
| Is this logic duplicated?                            | `fallow dupes`                      |
| Where are the complexity hotspots?                   | `fallow health`                     |
| Did this branch cross an architecture layer?         | `fallow audit`                      |
| What calls this across the repository?               | `codedocs callers`                  |
| What statically reachable paths leave this function? | `codedocs trace`                    |
| What does this change reach?                         | `codedocs impact`                   |
| Which tests does this change reach?                  | `codedocs impact --label role=test` |
| Which docs contradict the code?                      | `codedocs docs check`               |

The boundary is deliberate: two tools answering the same question with different algorithms is a recipe for disagreement.

---

# Performance

Performance claims are measured against real fixture repositories with full git history.

Current reference numbers:

- **4,827 files** across **28 TypeScript projects**
- cold analysis: **~17 seconds**
- resulting index: **~17 MB**
- warm query: **~300 ms**, including process startup
- single-file repair: **~0.8 seconds**

The benchmark repositories live in `repos/` during development and are intentionally gitignored.

See [`docs/research/`](docs/research) for the measurements rather than treating the README numbers as universal guarantees.

---

# Development

```sh
pnpm test           # vitest
pnpm test:coverage  # vitest with v8 coverage
pnpm typecheck      # tsc across the workspace
pnpm lint           # oxlint
pnpm check          # oxfmt --check && oxlint
pnpm check:network  # verify dependency closure cannot reach the network
pnpm format         # oxfmt && oxlint --fix
pnpm spell-check    # cspell
```

To build from source:

```sh
git clone git@github.com:magicspon/codedocs.git
cd codedocs
pnpm install
pnpm build
./node_modules/.bin/codedocs analyse --cwd /path/to/repository
```

---

# Design and architecture

The implementation is deliberately documented before the code.

- [`docs/SOLUTION.md`](docs/SOLUTION.md) — how codedocs works
- [`CONTEXT.md`](CONTEXT.md) — the project glossary
- [`docs/adr/`](docs/adr) — architectural decisions
- [`docs/research/`](docs/research) — measurements behind those decisions
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — requirements and boundaries
- [`docs/agent-guide.md`](docs/agent-guide.md) — using codedocs from an agent
- [`bench/`](bench) — fix benchmark and methodology
- [`bench/RESULTS.md`](bench/RESULTS.md) — generated benchmark results

The README explains **what codedocs does**.

The ADRs explain **why it does it that way**.

---

# Status

codedocs is **pre-alpha and unreleased**.

The CLI, renderers and MCP server currently work end to end on real TypeScript repositories, but the API and behaviour are not yet considered stable.

The first npm release is pending.

## Licence

MIT
