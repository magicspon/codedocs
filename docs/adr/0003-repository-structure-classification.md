---
status: accepted
---

# Classification is a label layer on two axes, recomputed on every run

Classification is **not** an attribute of the `File` node. The index gains a **third kind of thing**
alongside nodes and edges — a **label**: one classification fact about a node, carrying an axis, a
value, a `provenance` and a `derivation`. There are two orthogonal axes, `role`
(`source | test | config`) and `authorship` (`authored | generated`), because a single exclusive enum
misclassifies every interesting file in the fixtures. The whole label set is **recomputed on every
run and never invalidated incrementally**, because it costs ~0.9 s on the largest fixture.

ADR 0002's five node types and nine edge kinds are **unchanged**. A `Label` is deliberately not a
sixth node type: it would be a node whose entire existence is one edge back to its subject, which is
the reasoning that demoted `Repository` to an index header in the first place.

## The two axes

`role` and `authorship` are independent because the fixtures refuse to let them collapse.

| File                                            | `role`   | `authorship` | Why one enum fails                                     |
| ----------------------------------------------- | -------- | ------------ | ------------------------------------------------------ |
| `apps/web/next.config.ts`                       | `config` | `authored`   | Config **and** type-checked TS that imports repo code  |
| `packages/app-store/apps.metadata.generated.ts` | `source` | `generated`  | Generated **and** real source other source imports     |
| `.redwood/types/includes/web-routerRoutes.d.ts` | `source` | `generated`  | Generated **and** an ADR 0001 precondition for `typed` |
| `packages/lib/date-fns.test.ts`                 | `test`   | `authored`   | —                                                      |

Every row an exclusive enum gets wrong, it gets wrong in the same direction: it drops real source out
of the graph.

## The signals

Highest precedence first. Union, not first-match, except where user config overrides.

| Axis         | Derivation         | Signal                                                           | Provenance      |
| ------------ | ------------------ | ---------------------------------------------------------------- | --------------- |
| both         | `user-config`      | a `classify` glob in `codedocs.jsonc`                            | `deterministic` |
| `authorship` | `git-untracked`    | present on disk, not tracked by git                              | `deterministic` |
| `authorship` | `generated-header` | `@generated`-style sentinel in the first 5 lines                 | `syntactic`     |
| `authorship` | `codegen-path`     | `*.generated.*`, `next-env.d.ts`, `.next/types/**`, `.prisma/**` | `inferred`      |
| `role`       | `path-convention`  | `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `*.config.*` | `inferred`      |
| `role`       | `tsconfig-exclude` | corroboration only — never the sole reason for a label           | `deterministic` |

Defaults: `role: source`, `authorship: authored`.

## Considered Options

- **An attribute on the `File` node.** Rejected: it has no room for the ordinary case where two
  signals fire with different confidence — a file that is `generated` both because git does not track
  it (`deterministic`) and because it is named `.generated.ts` (`inferred`). It also forces user
  overrides to be a re-analysis rather than a label source, and it strands the component/hook layer
  that settled constraint 7 defers, which needs the same mechanism over `Symbol`.
- **`linguist-js` as the producer**, which the capability matrix left as its likeliest genuine gap.
  Rejected on measurement, and this closes that open question: Linguist's two headline signals —
  `linguist-generated` in `.gitattributes` and the `@generated` marker — together classify **13 of
  5,207** TypeScript files across the three fixtures. Only cal.com has a `.gitattributes` at all and
  its sole `linguist-generated` rule matches `/.pnp.*`, which contains no TypeScript. The dependency
  buys nothing the four signals above do not already produce.
- **Path convention alone, or directory convention alone, for `test`.** Rejected: neither contains
  the other. **295** of cal.com's test-named files live outside any test directory, and **172** files
  inside test directories are not test-named — the mocks, fixtures and setup helpers. Picking one
  signal silently loses a third of the population either way.
- **Test-runner config as a signal.** Rejected because it is unreadable, not because it is
  uninformative. Five of cal.com's seven runner configs are `jest.config.ts`, `vitest.config.mts` and
  `playwright.config.ts` — TypeScript whose globs exist only after evaluation — and ADR 0001 forbids
  codedocs executing repository code under any flag. `jest.config.json` is read when present. This is
  the reason `role` cannot claim to be deterministic and must not pretend otherwise.
- **A `fixture` role.** Rejected: the 172 non-test-named files inside test directories are exactly
  the population a separate role would create, and every caller that excludes tests wants them
  excluded too. A second role means every caller must remember to name both, and the first one to
  forget gets a wrong answer silently. Folded into `test`.
- **A `vendored` role.** Rejected on absence: all three fixtures contain **zero** vendored TypeScript,
  and cal.com's only `linguist-vendored` rule points at `/.yarn/**`. Settled constraint 5 applies to
  our own vocabulary as much as to dependencies. A user with vendored code maps it to
  `authorship: generated` in `codedocs.jsonc` and gets the behaviour they want with no new term.
- **A `declaration` role for `.d.ts`.** Rejected on measurement: cal.com's 49 tracked `.d.ts` are 14
  ambient `next-env`/`global` files and 35 hand-authored type modules (`IRedisService.d.ts`,
  `lib/dto/types.d.ts`) — genuinely authored source. All **134** generated `.d.ts` were untracked and
  already classified by `git-untracked`. The role would misclassify 35 real files to catch none.
- **A third `authorship` value distinguishing build output from codegen.** Rejected: the distinction
  is real — cal.com's `dist/*.d.ts` are a compiled mirror that would duplicate every symbol, while
  Redwood's `.redwood/types` have no source twin and must reach the checker — but it is a _membership_
  question, and membership already has an owner. A file is in the index iff a `Project` globs it, and
  cal.com's own tsconfigs `exclude` `dist` 21 times. Making it a label would give one fact two sources
  of truth, and the duplicate-symbol failure would become a heuristic we could get wrong rather than
  a state we cannot reach.
- **A fourth `provenance` value (`observed`) for filesystem-derived labels.** Rejected: `deterministic`
  is widened from "resolved by a type checker" to "observed, not guessed", which is what the word has
  to mean to survive outside the checker at all. A four-way switch in every consumer is a poor price
  for a distinction nobody acts on differently.
- **Incremental label invalidation.** Rejected on cost. The full pass is ~0.9 s on cal.com —
  `git ls-files` 0.01 s, the on-disk sweep 0.79 s, the header scan 0.07 s for all 5,025 files — against
  **22.9 s** for the call-graph sweep it precedes. Tracking dependencies for a label whose inputs
  include a repo-wide `.gitignore` and `codedocs.jsonc` is real machinery to save under a second, and
  it buys a staleness bug where an edited `codedocs.jsonc` leaves old labels behind.
- **Storing directory classifications.** Rejected: PRD §6's "source directories" and "test
  directories" are a render-time summary over file labels. cal.com has test files inside
  `packages/*/src` and source files inside `apps/*/test`, so a stored directory label is wrong for
  some file underneath it by construction. "Applications, packages, libraries" are not directory
  classifications at all — they are `Package` nodes from `@manypkg/get-packages`, with
  application-vs-library read off the manifest.

## Consequences

- **The index holds nodes, edges and labels.** This amends ADR 0002's framing, not its content: both
  closed enums stay at five and nine. CONTEXT.md's `Fact` gains labels as the third thing `provenance`
  attaches to.
- **The label store is keyed by node id**, so it holds `Symbol` labels natively. This is where settled
  constraint 7's deferred component and hook labelling lands — rows in the same store with derivations
  like `ast-grep-rule` — which is what makes that layer additive rather than a second model.
- **Symbols do not inherit their file's labels.** A consumer asking "which of these callers are in
  test files" joins against the store; a Symbol's file is already derivable from its `SymbolId`.
  Storing an inherited copy is ADR 0002's containment mistake in new clothes.
- **Labels never filter silently.** Core operations always label; scope is an explicit parameter whose
  default is uniform — `authorship: authored`, `role: all` — and every answer names what its scope
  excluded, as a blind spot in ADR 0001's sense. The `role` default is deliberately permissive:
  hiding test callers from `callers` makes tested-but-unreferenced code look dead, which is precisely
  the Redwood Cells trap the backend spike found and named. Any per-operation deviation is
  [#10](https://github.com/magicspon/codedocs/issues/10)'s to argue, not this ADR's to grant.
- **`role` is mostly `inferred` and `authorship` mostly `deterministic`**, and that asymmetry is the
  honest report rather than a defect to be engineered away. It follows directly from the fact that git
  knows what it does not track, while nothing but convention knows what a test is.
- **The escape hatch is a `classify` block in `codedocs.jsonc`** at the repository root: glob to
  partial label, last match wins, highest precedence. It may set `role` and `authorship` on files
  already in the index and **may not add files**, because membership belongs to the projects.
  Overrides are labels like any other, so an answer can always name the line that caused a file to be
  treated as generated.
- **`doctor` reports the disagreement list.** Counts per `(role, authorship)` pair with their
  derivations, plus files classified only by an `inferred` derivation, plus files where two signals
  fired with different answers — the `@generated` header without the matching name, the `.test.ts`
  inside `src/`. That list is the only way a user discovers the escape hatch exists.
- **A repository whose tsconfig admits its own `dist` gets duplicate symbols.** This is the residue of
  making membership the projects' answer. It is a defect in that repository, and `doctor` names it
  rather than codedocs papering over it with a heuristic.
