---
status: accepted
---

# Preconditions lower fidelity; honesty is evidence, not a score

Real TypeScript repositories are usually unanalysable as checked out: dependencies are uninstalled,
and framework codegen (Prisma, Redwood, Next) writes type directories that a `tsconfig` already
references. A type-aware backend pointed at such a repo does not fail — it returns `any` and
missing edges, silently. We decided that an unmet **precondition** lowers a file's **fidelity**
rather than aborting the analysis, that codedocs never runs a repository's own install or codegen,
and that the resulting uncertainty is reported as named **blind spots** on each answer rather than
as a confidence score.

## Considered Options

- **Refuse to analyse an unprepared repository.** Rejected: syntactic knowledge (files, packages,
  exports, import structure, Git history) is real and cheap, and on a fresh clone of a 5,000-file
  monorepo it is the honest, useful answer. Refusal also implies a repo-wide verdict, which is
  wrong — one unprepared package in a 34-project monorepo must not downgrade the other 33.
- **Run install and codegen automatically.** Rejected: `postinstall` is arbitrary code from a
  possibly unfamiliar repository. The capability gains nothing, because codedocs' primary consumer
  is an agent (or a human in a terminal) that can already run commands with the user's consent.
  codedocs reads; it never executes. A separate `codedocs prepare` command is deferred, not
  precluded.
- **A repo-wide confidence percentage on every answer.** Rejected: "40% of imports unresolved"
  cannot tell the caller whether _this_ answer is affected, and any threshold built on it is
  indefensible. Blind spots name the specific files that could have changed the specific answer,
  which is both honest and actionable.
- **A three-valued fidelity (`typed` / `partial` / `syntactic`).** Rejected: it folds completeness
  into fidelity, and the two invalidate on different triggers — fidelity on the environment
  fingerprint, blind spots on file content — so a single enum would go stale. Fidelity answers
  "which analysis ran"; blind spots carry what it could not see.
- **A framework registry as the detector.** Rejected as the _correctness_ path: detection is
  generic, so an unknown framework degrades correctly. A framework lookup only turns a fired signal
  into a concrete remediation string, and is allowed to be absent.

## Consequences

- **Detection is four generic signals**: `node_modules` absent or stale against the lockfile;
  `postinstall`/`prepare` declared; **`tsconfig` `include`/`files`/`rootDirs`/`paths` entries that
  match no files**; and unresolved specifiers. Measured against the fixtures, the
  third is the load-bearing one: a full, successful install cleared every `unprepared` cause and
  (via `postinstall`) both Prisma codegens, yet left `redwood` with no `.redwood/` and `next` with
  no `next-env.d.ts` or `.next/types`. Framework codegen is not an install step. Signal 2 therefore
  never fires a remediation on its own — once `node_modules` exists, `postinstall` has already run.
  [ADR 0009](0009-preflight-cost-and-signal-shapes.md) refines the fourth signal and the phase: the
  fourth is per-specifier facts grouped by cause, never a **ratio**, and it decides blind spots rather
  than fidelity, which is signals 1-3 alone. Preflight splits accordingly — only signals 1-3 can run
  before a program is open, so the fourth is a by-product of extraction — and a type checker's
  diagnostics are not a signal at all.
- **The environment fingerprint joins the cache key**, per project. Its inputs are fixed by
  [ADR 0009](0009-preflight-cost-and-signal-shapes.md): the lockfile hash, the project's
  `compilerOptions`, and the count and set-hash of the files its config globs. Without it, analysing a fresh
  clone and then running `pnpm install` leaves no file content changed, so an incremental pass would
  serve the syntactic answer forever — confidently wrong by caching. A fingerprint change is a
  legitimate full re-analysis of that project, and is reported as one.
- **The model must carry provenance per fact and store unresolved specifiers as facts** (with their
  cause), not drop them. Answering "which callers might be missing" requires the gaps to be in the
  index. This constrains the internal representation and the store schema.
- **Preflight is a core operation**, not a `doctor` implementation detail: `doctor` renders it,
  `analyse` runs it and persists the result as the index's analysis conditions, and `report-bug`
  becomes preflight plus the index header. `doctor` is static-and-instant by default, reading
  measured signals from the index; `--measure` re-runs signals 1-3 against the working tree and
  reports where they disagree with what the index stored — it opens no program and extracts nothing
  ([ADR 0009](0009-preflight-cost-and-signal-shapes.md)).
- **`analyse` always exits 0** and produces an index; `--strict` (no file below `typed` fidelity, no
  blind spots) is the CI and agent gate. Refusal is reserved for "no TypeScript project here".
- **The `broken` cause has no remediation** and must never be rendered as one — it is a finding
  about the repository, and telling that user to run an install would send them the wrong way. ADR
  0009 adds `unmapped` on the same footing for the opposite reason: a specifier only the framework's
  own resolver can find is a limit of codedocs, so there is no command to offer.
