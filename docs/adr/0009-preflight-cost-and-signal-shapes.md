---
status: accepted
---

# Preflight is filesystem work, and the type checker's diagnostics were never a signal

[ADR 0001](0001-analysis-preconditions-and-answer-honesty.md) made preflight **always the first
phase of an analysis**, and the backend spike then measured that phase at **36.4 s** over the 31
cal.com projects it swept — more than building the call graph. The obvious response was to scope
preflight to the files a question touches. We decided instead that there is nothing left to scope:
the cost was `getSemanticDiagnostics`, which is **not one of ADR 0001's four signals**, has never
appeared in `CONTEXT.md` or any ADR, and cannot distinguish a prepared repository from an unprepared
one. It leaves the design. What remains splits in two — filesystem signals that run first because
they are free, and unresolved specifiers that fall out of extraction as a by-product — and the
fourth signal loses its ratio.

## What the 36 seconds was

Split into its parts on cal.com, on the spike's machine and fixtures:

| Project        | files | specifiers | open program | unresolved-specifier scan | `getSemanticDiagnostics` |
| -------------- | ----- | ---------- | ------------ | ------------------------- | ------------------------ |
| `packages/lib` | 565   | 1,282      | 1,609 ms     | **0.7 ms**                | **2,233 ms**             |
| `apps/web`     | 3,235 | 16,693     | 3,756 ms     | **4.9 ms**                | **15,245 ms**            |

Opening the program is not preflight's cost — an analysis pays it anyway. Preflight's **marginal**
cost is the last two columns, and diagnostics are 2,233 of 2,233.7 ms and 15,245 of 15,249.9 ms of
it. On the same files, over 16,693 specifiers, the scan is **3,100× cheaper**, because module
resolution is already done by the time the program is open.

The signal also does not discriminate. Redwood's own codegen moved unresolved specifiers **24 → 9**
(−63%) and symbols **303 → 434**, while semantic errors moved **320 → 298** (−7%); a cal.com in its
own tooling's best available state carries **17,464** of them. A number that reads in the thousands
on a repository in working order cannot tell preparation from its absence, and the PRD never asked
codedocs to report type errors — that is `tsc`'s question, and it already answers it.

## Preflight's two halves

The remaining signals have different costs and different prerequisites, so they run in different
places.

| Half                       | What                                                       | Cost                   | When                                    |
| -------------------------- | ---------------------------------------------------------- | ---------------------- | --------------------------------------- |
| **The phase**              | signals 1–3: filesystem state, config globs, `postinstall` | `existsSync` work, µs  | first, unconditionally — it is free     |
| **The extraction residue** | signal 4: specifiers that resolved to nothing              | 0.7–4.9 ms per project | during the sweep, never as its own pass |

ADR 0001's "always the first phase of an analysis" survives and gains a definition: **the first
phase is the filesystem signals**, and it is unconditional because it costs nothing. Signal 4 is a
by-product of extraction and is never measured separately — which is also what closes the risk this
ticket was opened over. A scoped preflight would miss an unresolved import three files away;
extraction sees every file its project globs either way.

## The four signals, and the shape of the fourth

ADR 0001 worded signal 4 as "the measured unresolved-specifier **ratio**". The ratio is withdrawn.
It collides with ADR 0001's own rejection of repo-wide percentages — one cannot tell a caller whether
_this_ answer is affected — and with [ADR 0007](0007-cross-commit-continuity.md)'s rule that a
continuous signal forces a threshold and a threshold is a score wearing a different hat. No cutoff
was ever proposed, and none is.

Signal 4 is therefore **per-specifier facts**, each boolean, grouped by cause when reported. That
moves it out of fidelity: **fidelity is signals 1–3**, and unresolved specifiers are evidence on the
answers whose files carry them, where they are actionable. The measured cause distribution is what
argues for the grouping — of `apps/web`'s 542, **302 are the single specifier
`@calcom/prisma/enums`**: one absent generated artefact, one remediation, 302 blind spots cleared at
once.

The cause set gains a fourth value:

| Cause               | Means                                                      | Remediation |
| ------------------- | ---------------------------------------------------------- | ----------- |
| `unprepared`        | declared as a dependency, absent from disk                 | yes         |
| `missing-generated` | its target lies where a codegen step would have written    | yes         |
| `unmapped`          | resolves only under a resolver codedocs does not run       | **no**      |
| `broken`            | imported but declared nowhere — a defect in the repository | **no**      |

`unmapped` exists because the spike found **222 bare `app/…` specifiers** in `apps/web` that resolve
under the framework's own resolution and not under the declared `tsconfig`. Under three causes they
would be filed as `broken`, and codedocs would accuse a working repository of 222 defects because it
declines to run Next's resolver. It carries no remediation because a remediation is a _command_ and
there is none, which keeps `broken`'s narrow meaning intact.

## The environment fingerprint, made computable

Fidelity is **stored with the facts it describes and never recomputed at query time**. Signals 1–3
are cheap enough to re-run per query, and doing so would be a lie: an index whose facts were
extracted with no `node_modules` would report `typed` the moment an install landed. Fidelity is a
property of the analysis that ran, not of the machine as it is now — which makes ADR 0001's
environment fingerprint load-bearing rather than an optimisation, so it needs a definition that can
be computed:

- the **lockfile hash**;
- the project's **`compilerOptions`**;
- the **count and set-hash of the files its config globs**.

None of the three walks `node_modules`. The third is what catches codegen landing, which a lockfile
hash misses entirely — `yarn rw g types` touches no lockfile, and ADR 0001 already measured that
framework codegen is not an install step. The accepted blind spot: a hand-modified `node_modules`
under an unchanged lockfile reads as unchanged, and `doctor --measure` is the escape hatch.

## What `doctor` runs

ADR 0001 gave `doctor` a static-and-instant default reading the index, with `--measure` forcing a
fresh sweep — written when the fresh sweep was the diagnostics pass. `--measure` now **re-runs
signals 1–3 against the working tree and reports where they disagree with what the index stored**.
It does not open a program and does not extract: that is the "an install has landed, fidelity could
rise" case, and it is the one thing the static view cannot know, because after the rule above the
static view is deliberately stale by design. A flag that silently costs a cold build (12 s over
cal.com's projects in the skeleton, 22.9 s in the spike's per-project sweep) is exactly the hidden
cost ADR 0006 kept `analyse` around to avoid.

`doctor` reaches **exit 1 iff at least one cause with a remediation is unmet**, whichever signal
evidenced it. The exit code follows the _cause_, not the signal: a filesystem signal and a specifier
group are the same finding at different granularity, and `missing-generated` is remediable however it
was seen. `unmapped` and `broken` never reach 1 on their own. This mirrors
[ADR 0006](0006-operation-set-and-renderer-contract.md)'s ruling that only `contradicted` reaches 1
for `docs check`: the code means "something you can act on", not "something is imperfect". Because one
cause can be evidenced twice — signal 3 fires for a project whose codegen never ran, and its files'
specifiers say the same thing — `doctor` **deduplicates causes across signals**, or it reports the
same missing codegen once per signal.

## How preflight reaches an answer

No new envelope field. ADR 0006's three channels already carry all of it, and after the decisions
above nothing about preflight is scoped, so there is no coverage figure to report — this ticket's
fourth question dissolves rather than gets answered.

- **Fidelity** rides on `conditions`, per project the answer touched, as ADR 0006 already scoped it.
- **Unresolved specifiers** are blind spots, **filtered to the files in the answer's own result**.
  `apps/web`'s 542 have no business appearing on a `callers` answer over three files of
  `packages/lib`, for the same reason ADR 0006 scoped `conditions`: the envelope must grow with the
  question, not with the repository.
- **One exception**, without which the silent case ADR 0001 exists to prevent would return: a cause
  that is project-wide — signal 3 fired, the project globbed nothing, so no file of it was analysed —
  is reported against the **project**, because there are no per-file rows to filter.

Storage is **per site, deduplicated by the operation**. One row per unresolved specifier occurrence,
keyed by file, exactly as `unresolved_call` already is; the reported unit stays one distinct
specifier with its count and its files. Aggregating in the store instead would fight
[ADR 0004](0004-index-storage-and-invalidation.md): the wave's write unit is one file
(`delete … where path_id = ?`, then reinsert), so a project-level count row needs read-modify-write
across files and goes wrong precisely where ADR 0004 permits a partial build committed per project.
The volume worry that kept bare specifiers out of the store is answered by interning, which the index
already does for this column — `unresolved_call.cause` repeated one of two words **91,674 times** on
cal.com.

## Considered Options

- **Scope the diagnostics sweep to the question's file set.** Rejected, and it is the option the
  ticket was named after. Scoping an expensive signal is only worth doing if the signal is worth
  having: this one is absent from every ADR, absent from the code, moves 7% where the signals that
  work move 63%, and reads 17,464 on a healthy repository. There is nothing to scope.
- **Keep diagnostics as a fifth signal, measured per project on demand.** Rejected on the same
  evidence. A signal that cannot separate prepared from unprepared does not become useful by being
  optional; it becomes a number users will reasonably mistake for a health score, which is what ADR
  0001 exists to refuse.
- **Signal 4 as a ratio with a threshold.** Rejected: no defensible cutoff exists, ADR 0007 already
  ruled that a threshold is a score in disguise, and a rate cannot tell a caller whether the answer
  in front of them is affected. Per-specifier facts can.
- **Recompute fidelity from the filesystem on every query.** Rejected. It costs microseconds and it
  is wrong: it would report `typed` over facts extracted syntactically, which is the "confidently
  wrong by caching" failure ADR 0001 wrote the fingerprint against, arriving from the other side.
- **Store unresolved bare specifiers pre-aggregated per project.** Rejected as storage, kept as
  reporting. Per-project counts cannot be maintained by a per-file write unit without
  read-modify-write, and ADR 0004's partial builds are committed per project.
- **Keep dropping unresolved bare specifiers, as the shipped store does.** Rejected: it discards the
  evidence for the cause that matters most. `@calcom/prisma/enums` × 302 is bare, and
  `missing-generated` cannot be reported without it.
- **A tolerance or per-cause exemption for `analyse --strict`.** Rejected: an exemption list is a
  tolerance that has learned to spell, and ADR 0007 forbids the threshold underneath it.
- **`doctor --measure` re-analyses.** Rejected: a diagnostic flag that costs a cold build is a hidden
  `analyse`, and ADR 0006 kept `analyse` a separate operation precisely so a cold build is a step a
  caller chose.
- **A new envelope field naming what preflight covered.** Rejected: preflight covers every project it
  ran on, so the field would be a constant. `conditions` and blind spots already carry the facts.
- **A fourth cause with a remediation (an alias map in `codedocs.jsonc`).** Not decided here. An
  alias map would clear `unmapped`, which makes it a candidate third knob for
  [#19](https://github.com/magicspon/codedocs/issues/19) — recorded as evidence for that ticket, not
  adopted by this one, since ADR 0006 deliberately added nothing to that file.

## Consequences

- **`getSemanticDiagnostics` is not called anywhere in codedocs**, and preflight's marginal cost over
  an analysis falls from 36.4 s to the 0.7–4.9 ms per project of the specifier scan. The 36 s
  constraint the spike raised against ADR 0001 is discharged rather than mitigated.
- **The environment fingerprint is now a defect, not a missing feature.** The shipped code has none —
  `session.ts` reuses a stored fidelity with nothing to invalidate it — so an install after a cold
  analysis is invisible today. Filed with signals 2 and 4, which invalidate with it, as one
  implementation issue; `projectFidelity`'s `TODO(#13)` already points at them.
- **`analyse --strict` gets harder to pass, and stays that way.** With bare specifiers in the index,
  a repository whose imports resolve only under a framework's private resolution — prepared Redwood
  still carries 9, cal.com 222 — cannot pass `--strict`. That is the gate reporting a real limit in
  codedocs, not a false alarm about the repository, and the honest answer remains available at exit 0
  with named blind spots. No tolerance is added.
- **`doctor` owes cause deduplication across signals**, and its exit code is defined by remediability
  rather than by which signal fired.
- **Every unresolved specifier is stored, none is a ratio, and `unmapped` is not an accusation.**
  ADR 0001's `broken`-has-no-remediation rule extends to `unmapped` for a different reason: `broken`
  has no remediation because none would help, `unmapped` because none is a command.
- **Revisit trigger: a measured false `typed`** — a project with `node_modules` present, files
  globbed, no unresolved specifiers, and a materially wrong edge set. That is the only case the
  surviving signals cannot catch by construction, and the only evidence that would indict them.
  Phase 5's `impact` work is where a wrong edge set would first surface. Nothing softer reopens this:
  a repository's semantic errors say nothing about whether codedocs saw it correctly.
