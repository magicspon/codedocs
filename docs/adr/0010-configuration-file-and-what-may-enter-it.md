---
status: accepted
---

# `codedocs.jsonc` holds facts codedocs cannot determine, and nothing else

Two decisions had each contributed one narrow knob — ADR 0003's `classify`, ADR 0008's `baselines` —
which is exactly the point at which a config file stops being designed and starts being a junk
drawer. This ADR does not design the file. It writes down the **rule for entry**, admits the keys
that rule has already earned, and rejects the one candidate that fails it.

It also closes [#17](https://github.com/magicspon/codedocs/issues/17): **codedocs never executes
repository code**, `codedocs prepare` does not exist, and the one thing that ticket left undecided —
where the remediation string for a `missing-generated` cause comes from — lands here as the third
key.

## The rule

> A key may enter `codedocs.jsonc` only when an ADR finds something codedocs **cannot determine** and
> must be told. Every key has a default, so the file itself is optional. No key may change what is
> reported about what was analysed.

Three tests. A candidate passes all three or it is not a key.

1. **Undetectable.** codedocs cannot observe it. ADR 0001 rejected a framework registry as the
   _detector_ on exactly this ground — detection is generic so an unknown framework degrades
   correctly — and the same reasoning forbids configuring anything detection already covers.
2. **Defaulted.** Absence is legal and yields a defensible answer. ADR 0005 rejected a configured
   glob for document discovery because "it makes every user write configuration before" anything
   works, and ADR 0006 records that discovery as a 9 ms scan needing no configuration. A key that
   must be set makes every repository pay for the one that needed it.
3. **Scope-only.** It changes _the question_ — ADR 0006's third channel of honesty — never the
   answer's account of itself.

The corollary is what keeps the file small: **it holds facts, never preferences.** A default
`--limit`, an output format, a colour setting, a "quiet" flag — codedocs can determine all of them,
so none is a fact about the repository and none may enter. This is the whole design; the schema
below is a consequence of it.

Both shipped keys pass. `classify` (ADR 0003) tells codedocs a file is generated when no signal can
see it, and sits at the highest precedence _while still carrying its `user-config` derivation into
every answer_. `baselines` (ADR 0008) is a disk budget only the user knows, and `0` disabling capture
withholds a comparison rather than a fact.

## The file

```jsonc
{
  "version": 1,
  "classify": {/* ADR 0003 */},
  "baselines": 3, // ADR 0008
  "discover": {
    "projects": ["packages/*/tsconfig.build.json"],
    "skip": ["repos"],
  },
  "remediations": [
    { "specifier": "@calcom/prisma/*", "run": "pnpm prisma generate" },
  ],
}
```

Every key is optional, and the defaults are `version: 1`, no `classify` rules, `baselines: 3`,
`discover: { projects: [], skip: [] }`, `remediations: []`.

### `discover`, which is what `discovery.ts`'s project-path TODO actually wanted

`discoverProjects` matches `tsconfig.json` by exact name, because variants like `tsconfig.base.json`
are usually shared fragments that open as projects with no root files. A repository that names its
real projects otherwise has no way in. `discover.projects` is that way in: paths or globs naming
**additional** config files, **added to** what the walk found, never replacing it.

`discover.skip` adds directory names to the walk's `SKIP_DIRS`, and is likewise additive — a user
cannot remove `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.next`, `.turbo`,
`.cache` or `.codedocs` from it. A config key that appears to control something hard-coded elsewhere
is a config that lies, and the failure is silent.

The motivating case is this repository. `repos/` holds five fixture checkouts, one of which is
cal.com and contributes 28 tsconfigs of its own; nothing in the skip list knows about it and no
tsconfig excludes it, so codedocs analysing itself discovers a foreign repository's projects.
`discover.skip` is for that third case and nothing else.

**Neither key decides membership.** A file is in the index iff a `Project` globs it — ADR 0003
rejected a third `authorship` value for build output on precisely this ground, that membership
already has an owner. `discover` changes which projects exist; the projects still decide which files
they hold.

### `remediations`, which is [#17](https://github.com/magicspon/codedocs/issues/17)'s residue

ADR 0009 gives `missing-generated` a remediation, and codedocs cannot know what it is. ADR 0001
measured why: a full, successful install ran both of cal.com's Prisma codegens through `postinstall`
and still left Redwood with no `.redwood/`. **Framework codegen is not an install step**, so signal 2
never sees it, and `yarn rw g types` — the command that took Redwood from 303 symbols and 102 call
edges to 434 and 107 — appears in no script codedocs can read.

An **ordered array**, first match wins, because glob precedence has to be explicit and JSON object
key order is not a contract. It is consulted for **`missing-generated` alone**:

- `unprepared` needs an install command, which is determinable from the lockfile, so it fails test 1
  and is not configurable.
- `unmapped` and `broken` carry no remediation at all (ADR 0001, ADR 0009), and an entry matching one
  is never consulted.

One entry can clear a great deal: 302 of `apps/web`'s 542 unresolved specifiers are the single
specifier `@calcom/prisma/enums`.

There is **no built-in framework table.** ADR 0001 already allows the lookup to be absent, and a
shipped table would be `inferred`, would rot on every framework release, and would hand a user a
command that sends them the wrong way — which is ADR 0001's own reason `broken` carries no
remediation. Absent a matching entry, `doctor` names the cause and the path where the artefact would
have been, and offers no command. codedocs ships knowing nothing about any framework, deliberately.

## Discovery, and a repository root that means one thing

**One file, named `codedocs.jsonc`, at the repository root.** Found by resolving the root, not by
walking up from the file under analysis.

That requires the root to be unambiguous, and today it is not. `findRepositoryRoot` walks up for the
nearest `.git` **or** `package.json`, so running codedocs inside `packages/emails` of a monorepo
makes that package the repository — with its own `.codedocs/index.db`, its own snapshot, and its own
answers. **The root is the nearest enclosing `.git`**, and the nearest `package.json` only where
there is no `.git`, which ADR 0004 requires so codedocs works in a checkout that is not a repository.

A `codedocs.jsonc` found anywhere below the root is an **error naming both paths**, at exit 2. Not a
merge, not nearest-wins. The project walk already visits every directory, so noticing one costs
nothing, and the alternative is a file in a package silently governing an index that spans the whole
tree.

**Precedence is flags > config > defaults**, with the resolved values echoed per ADR 0006. No key
currently has a corresponding flag, so the rule costs nothing today and is written down for the first
one that does.

## Parsing, versioning, and unknown keys

**Absent is normal.** Every key defaults; `analyse` proceeds and says nothing about it.

**Malformed is exit 2**, with the envelope carrying `error` instead of `result`, naming the file, the
key and what was expected — never a stack trace, and never a fall back to defaults. A file that exists
and is wrong means the user's intent is unknown, and guessing at it is how a config file produces a
confidently wrong answer.

**Unknown keys are an error**, naming the key and its nearest valid neighbour. The evidence is the
grilling thread itself, where `exclude` arrived with two of its letters transposed: under lenient
parsing that file parses, excludes nothing, and never says so. The cost is real and accepted — a
config using a key added in a later codedocs fails on an earlier one — but it fails loudly, which is
the better half of the trade.

**`version` is an integer, optional, and read as `1` when absent.** It does nothing on its own: ADR
0004 discards the index on a schema mismatch and a config file cannot be discarded. Its only job is to
make a future shape change legible as "this file is for codedocs 2" rather than as five unknown-key
errors.

`.jsonc` is a promise the extension makes: comments and trailing commas are read.

## What configuration may never do

> Config may change **what is in scope**. It may never change **what is reported about what was
> analysed**: no key may suppress a [[Blind spot]], a [[Truncation]], a [[Fidelity]] label or a
> [[Provenance]], and any key that changes scope is echoed with the answer.

This is test 3 stated as a prohibition, and it is what makes the alias map below rejectable on
principle rather than on taste. It also explains why the two shipped keys are safe: `classify`
relabels a file and the label still carries `user-config` into the answer; `baselines: 0` withholds a
comparison and every answer that wanted one says so.

## Considered Options

- **A required config file**, which the ticket's answers initially asked for. Rejected: it makes
  `codedocs analyse` on a fresh clone exit 2 having answered nothing about a repository it could have
  analysed perfectly, and it contradicts ADR 0005 and ADR 0006, which both refused to make users
  write configuration first. The one honest argument for it was as a **root marker**, disambiguating
  a monorepo — and "the nearest enclosing `.git`" buys that for free, without a file.
- **A `baseDir` field.** Rejected twice over. As a membership filter it is illegal, giving ADR 0003's
  single owner of membership a second source of truth. As a discovery hint it is the wrong shape and
  the wrong default: of the three fixtures, only the single-package Next app has a root `src/` or a
  root `tsconfig.json` — cal.com and the Redwood app have neither, so `baseDir: "src"` finds nothing
  in exactly the two repositories it exists to help. What discovery actually lacks is **config
  paths**, which is `discover.projects`.
- **An `exclude` list containing `node_modules`.** Rejected: it is already hard-coded in `SKIP_DIRS`,
  and a user who deletes it from their config does not get `node_modules` analysed — they get a
  config that lies about what it controls.
- **tsconfig's nearest-wins lookup.** Rejected: it is the right rule for a tool whose unit is a
  directory and the wrong one for a tool whose unit is a repository. ADR 0004 gives one index per
  working tree at `.codedocs/index.db`, so nearest-wins means a file in one package governs an index
  spanning every other. The walking-up half of the rule survives; the multiplicity does not.
- **`extends`.** Rejected: composition with nothing yet worth composing, and it would reintroduce the
  multiplicity above through a second door.
- **An alias map**, ADR 0009's parked candidate, which would clear `unmapped` by resolving the 222
  bare `app/…` specifiers cal.com's `apps/web` carries. Rejected on **test 3**: it does not change
  scope, it manufactures edges from a user's guess, and a wrong map produces confidently wrong call
  edges that codedocs has no way to detect. `unmapped` is a stated limit of codedocs rather than a
  defect of the repository, and a knob whose effect is to make that limit invisible is the one thing
  this file must not contain. The deterministic place for the mapping is the repository's own
  tsconfig `paths`, where every other tool benefits from it too.
- **A built-in framework table for `remediations`.** Rejected: see above — ADR 0001 permits the
  lookup to be absent, and a rotting table that occasionally sends a user the wrong way is worse than
  no command at all.
- **Lenient unknown keys.** Rejected on the transposition above — a config that parses, does
  nothing, and says nothing about either.
- **`codedocs prepare` as an operation.** Rejected, closing #17's first bullet. Every behaviour asked
  of it — check the repository is valid, run nothing, warn about what is missing — is already
  `doctor`'s, respectively ADR 0006's precondition result unit, CONTEXT.md's rule that codedocs
  reports remediations and never runs them, and ADR 0009's exit 1 on an unmet remediable cause. ADR
  0006 priced a new operation at a manifest entry, three bindings, a documented exit code and
  reference docs; a synonym is the cheapest possible reason to pay it.
- **A fifth preflight signal for "the repository is valid".** Rejected: ADR 0001 fixed the set at
  four and signal 3 — `tsconfig` entries matching no files — is already the load-bearing one. "No
  TypeScript project here" is not a signal but ADR 0001's one reserved refusal, at exit 2.
- **A warning channel for a stray `codedocs.jsonc`.** Rejected: ADR 0006 has exactly three channels
  of honesty and none of them is a warning. A file being silently ignored is precisely the failure
  worth an error.

## Consequences

- **The file is optional and stays optional.** Any future key that cannot default is evidence the
  decision behind it is wrong, not evidence the rule needs an exception.
- **`discovery.ts`'s project-path TODO resolves to `discover.projects`**, and `SKIP_DIRS` becomes a floor
  that `discover.skip` adds to.
- **`findRepositoryRoot` changes behaviour, fixing a live defect.** Preferring the nearest `.git`
  stops a monorepo package from reading as its own repository and writing its own
  `.codedocs/index.db`. This is a behaviour change for anyone running codedocs from inside a package
  today, and it is the correct one: ADR 0004's index describes a working tree, and a package is not
  one.
- **ADR 0004's invalidation table gains no row.** Project discovery is a tree walk that runs every
  session already, so `discover` needs no invalidation machinery; `remediations` attaches text to a
  cause at render time and changes no stored fact, so it can be edited without touching the index.
- **ADR 0009's environment fingerprint is untouched.** No key here changes what a project globs, its
  `compilerOptions`, or the lockfile, so the three inputs stand as fixed.
- **ADR 0006's operation set is unchanged** and stays closed. ADR 0001's four signals stay four.
- **codedocs never executes repository code**, in any operation, including a deliberately-invoked
  one. #13 ruled this for `analyse` and `doctor` and left a door open for a separate command; this
  closes it. The constraint is now a property of the tool rather than of two commands.
- **CONTEXT.md gains `Configuration`**, and `Remediation` gains its source — declared in
  `codedocs.jsonc` or absent, never guessed.
- **Implementation is filed, not done**: the schema, discovery and strict parse in
  [#52](https://github.com/magicspon/codedocs/issues/52), and the repository-root fix in
  [#53](https://github.com/magicspon/codedocs/issues/53).
- **Revisit trigger.** If `remediations` turns out to be a key every user must write for the same
  three frameworks, a shipped table becomes defensible as a **fallback beneath** user config, which
  this schema already permits without changing shape.
