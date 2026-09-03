/**
 * The operation set as data.
 *
 * ADR 0006 makes this the only mechanism that keeps the rest of it enforceable
 * rather than aspirational: the CLI parser, the MCP tool list, and later the JSON
 * schema and the reference docs are all derived from here. An operation added in
 * one place and forgotten in another is what turns settled constraint 3 — the
 * bindings are one to one with the operations — quietly false, and the way to
 * prevent that is to give the bindings nothing of their own to forget.
 *
 * Nothing here describes *how* an operation answers. It is the surface: the name,
 * what it takes, what it returns a list of, and the order it returns them in.
 */

import type { OperationName } from './envelope.ts'

/** The one positional argument an operation takes, if it takes one. */
export interface SubjectSpec {
  /** What it is called in help and in a tool's argument schema. */
  readonly name: string
  /** One or two sentences, for a caller who has only this to go on. */
  readonly description: string
  /**
   * Whether the subject is a whole command line rather than one token.
   *
   * `report-bug`'s subject is the command it re-runs, which has its own flags
   * and its own subject, so it is taken as everything after `--` and never
   * joined into a string: quoting a command line and splitting it again is a
   * parser, and a lossy one.
   */
  readonly variadic: boolean
}

/**
 * One flag an operation adds to the global set.
 *
 * Described here rather than in a binding, because ADR 0006 has three bindings
 * and a flag documented in one of them is a flag the other two get wrong.
 */
export interface OperationFlag {
  /** As spelled, without its `--`. */
  readonly name: string
  /** What its value is called in help, or `null` for a boolean flag. */
  readonly value: string | null
  /** Half a line, as `--help` lists it. */
  readonly summary: string
  /** One or two sentences, for a caller who has only the tool list to go on. */
  readonly description: string
}

/** One operation's surface. */
export interface OperationSpec {
  /**
   * As ADR 0006's table spells it, which for the two `docs` operations is two
   * words. The CLI takes them as two positionals; `tool` is what MCP calls them.
   */
  readonly name: OperationName
  /** One line. `--help` prints it and the MCP tool list carries it. */
  readonly summary: string
  /**
   * When to reach for this operation rather than a neighbouring one.
   *
   * `summary` says what an operation answers; this says when it is the right
   * question to ask. An agent choosing from a tool list has only these two
   * strings to go on, and picking `trace` where `callers` would do is the
   * expensive mistake — so the advice lives beside the operation rather than in
   * a document a binding cannot read.
   *
   * Required rather than optional: an operation arriving without it would reach
   * the tool list describing itself less well than its neighbours, which is the
   * kind of drift the manifest exists to prevent.
   */
  readonly selection: string
  /** `null` for an operation that takes no subject, which is `analyse` alone. */
  readonly subject: SubjectSpec | null
  /**
   * Whether `--depth` applies.
   *
   * Per operation because a flag silently ignored is worse than a flag refused:
   * a caller who asked `callers --depth 2` would read a one-hop answer as a
   * bounded walk.
   */
  readonly depth: boolean
  /**
   * The flags this operation adds to the global set, without their `--`.
   *
   * ADR 0006 closes the global set and permits per-operation flags as additive
   * only, so they are declared here and refused everywhere else — for the same
   * reason `depth` is: a flag another operation ignores reads as a flag it
   * honoured.
   */
  readonly flags: readonly OperationFlag[]
  /**
   * How `result` is shaped, which is the one thing a binding must describe and
   * cannot read off the other fields.
   *
   * `list` is a list of `unit`s. `report` is a single object with no unit for a
   * limit to count. `kinds` is several lists at once, each bounded by its own
   * `--limit` and reporting its own truncation — ADR 0006 singles `evidence`
   * out for that, because a shared pool means adding a caller quietly evicts a
   * document. `document` is Markdown plus what went into it: one object, and a
   * unit `--limit` counts, because ADR 0013 bounds a draft by section.
   */
  readonly shape: 'list' | 'report' | 'kinds' | 'document'
  /**
   * The name the MCP binding publishes, which is the CLI's with spaces replaced.
   *
   * ADR 0006's rule is one tool per operation under the *same name*, and this is
   * its one documented exception: a tool name may not carry a space, so `docs
   * check` is published as `docs_check`. Derived rather than declared per
   * operation, so an operation cannot arrive with a name in one binding and a
   * different one in the other.
   */
  /** ADR 0006's result unit, which is what `--limit` counts. `null` where there is none. */
  readonly unit: string | null
  /** ADR 0006's sort key. Part of the contract, not an implementation detail. */
  readonly sortedBy: string | null
}

/** A subject is anything an operation prints as an identifier. */
const IDENTIFIER: SubjectSpec = {
  name: 'subject',
  description:
    'Anything codedocs prints as an identifier: `src/auth/service.ts#AuthService.login` ' +
    'names one symbol exactly, and `AuthService.login` may resolve to several — in ' +
    'which case the answer is their union and `request.resolved` names them.',
  variadic: false,
}

/**
 * Every operation the skeleton binds, in the order `--help` lists them.
 *
 * TODO(#10): widen to ADR 0006's full table as each operation lands.
 */
export const OPERATIONS: readonly OperationSpec[] = [
  {
    name: 'analyse',
    summary: 'build or refresh the index, one row per project',
    selection:
      'Reach for this only when the build is a step of its own — a cold build ' +
      'in CI that should fail on its own. Every other operation repairs the ' +
      'index before it answers, so asking a question is never a reason to run ' +
      'this first.',
    subject: null,
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'project',
    sortedBy: 'tsconfig path',
  },
  {
    name: 'symbol',
    summary: 'every symbol whose name matches a glob',
    selection:
      'Reach for this when you have a name and not a location. It is a glob ' +
      'match rather than a ranked search, so widen with `*Service` and narrow ' +
      'with a qualified name. Once you have the symbol and want everything ' +
      'about it, `evidence` answers in one call what a sequence of these would.',
    subject: {
      name: 'pattern',
      description:
        'A glob, matched against both the declared name and the qualified name — ' +
        '`*Service`, `AuthService.login`, or `*` for everything. There is no ' +
        'ranking: results are sorted, never scored.',
      variadic: false,
    },
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'node',
    sortedBy: 'SymbolId, then path',
  },
  {
    name: 'callers',
    summary: 'every call edge into a subject',
    selection:
      'Reach for this to answer "what breaks if I change this" one hop out. ' +
      'It is direct call edges alone: use `trace` where the flow crosses ' +
      'several hops, and `references` for the places that name the subject ' +
      'without calling it — a symbol with no callers may still have those.',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'callees',
    summary: 'every call edge out of a subject',
    selection:
      'Reach for this to see what one symbol depends on, one hop out. Use ' +
      '`trace` instead when the question is what actually happens end to end, ' +
      'rather than what this one body calls.',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'references',
    summary: 'everything that names a subject without calling it',
    selection:
      'Reach for this where a call graph would miss the answer: a type ' +
      'annotation, an import, a symbol passed as a value. Deciding a symbol is ' +
      'unused on `callers` alone is how a reference is discovered late.',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'reference edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'file',
    summary: 'what the index holds about one file',
    selection:
      'Reach for this when the subject is a path rather than a name. It is the ' +
      'cheapest way to orient in an unfamiliar file — what it declares and what ' +
      'labels it carries — before spending context reading it.',
    subject: {
      name: 'path',
      description:
        'A repository-relative path, or the tail of one: `checkout.ts` finds ' +
        '`src/checkout.ts`. A tail matching several files answers about each, ' +
        'and `request.resolved` names them.',
      variadic: false,
    },
    depth: false,
    flags: [],
    shape: 'list',
    unit: 'file',
    sortedBy: 'path',
  },
  {
    name: 'trace',
    summary: 'every path of calls out of a root',
    selection:
      'Reach for this when the question crosses layers and one hop cannot ' +
      'answer it — how a request reaches the database, what a handler really ' +
      'does. It is the expensive operation: an unbounded walk from a busy root ' +
      'yields thousands of paths, so bound it with `depth` unless you have ' +
      'measured that you can afford not to.',
    subject: {
      name: 'root',
      description:
        'The symbol to walk outward from, in either form a subject takes. The ' +
        'walk is unbounded unless `depth` bounds it.',
      variadic: false,
    },
    depth: true,
    flags: [],
    shape: 'list',
    unit: 'path',
    sortedBy: 'the SymbolId sequence, lexically',
  },
  {
    name: 'evidence',
    summary: 'everything the index holds about one subject, assembled',
    selection:
      'Reach for this first when you have one subject and want to understand ' +
      'it: it returns every kind of fact at once, so it replaces a sequence of ' +
      '`symbol`, `callers`, `callees` and `references` with one call. Narrow to ' +
      'a single operation afterwards when one kind needs a larger `limit`.',
    subject: IDENTIFIER,
    depth: false,
    flags: [
      {
        name: 'claims',
        value: null,
        summary: 'restate the facts as claim expressions (--json only)',
        description:
          'Restate the facts in the payload as ADR 0005 claim expressions, so ' +
          'an agent writing a document never invents the syntax. Opt-in and ' +
          'machine-only: a claim string is a restatement of a fact the answer ' +
          'already carries, so sending it always would spend budget saying the ' +
          'same thing twice. A claim whose subject is a local symbol is not ' +
          'emitted — ADR 0005 refuses one at check time.',
      },
    ],
    shape: 'kinds',
    unit: 'fact',
    sortedBy: 'each kind by its own key',
  },
  {
    name: 'docs check',
    summary: 'every document, and which of its claims the code now contradicts',
    selection:
      'Reach for this to ask whether the prose still matches the code, across ' +
      'every document at once. Use `docs affected` instead when you have just ' +
      'changed something and want only the documents that change reaches.',
    subject: null,
    depth: false,
    flags: [
      {
        name: 'fail-on',
        value: 'verdict',
        summary: 'also exit 1 for this verdict (default: contradicted alone)',
        description:
          'Also exit 1 for documents reaching this verdict, on top of ' +
          '`contradicted`, which always does. One of `potentially-stale` or ' +
          '`unable-to-verify`. The default is deliberate: ADR 0005 measured ' +
          'pointer signals of `potentially stale`’s character at 59-77% false ' +
          'alarms, and wiring that to a red build is the change that would get ' +
          'this removed from CI within a month.',
      },
    ],
    shape: 'list',
    unit: 'document',
    sortedBy: 'path, then section order',
  },
  {
    name: 'docs affected',
    summary: 'which documents a change reaches, re-checked against the index',
    selection:
      'Reach for this after making a change, to ask which documents it reaches ' +
      'rather than re-checking every document in the repository. With no ' +
      '`base` it answers "what have I broken right now", which is the question ' +
      'worth asking before a commit.',
    subject: null,
    depth: false,
    flags: [
      {
        name: 'base',
        value: 'ref',
        summary: 'widen the changed set to everything since this commit',
        description:
          'Widen the changed set to everything that differs from this commit. ' +
          'With no argument the changed set is the drift the session already ' +
          'computed, so the zero-argument case answers "what have I broken ' +
          'right now" with no git and no configuration.',
      },
    ],
    shape: 'list',
    unit: 'document',
    sortedBy: 'path',
  },
  {
    name: 'docs draft',
    summary: 'a Markdown draft of one subject, prefilled with its facts',
    selection:
      'Reach for this when you are about to write documentation and want the ' +
      'facts already laid out — it is `evidence` shaped as the file you were ' +
      'going to open anyway. It writes no prose and no claims, only ' +
      'candidates: nothing it produces is checked until you delete a `?`. Use ' +
      '`evidence` instead when you want the facts and not a file.',
    subject: {
      name: 'subject',
      description:
        'A symbol in either form a subject takes, or a repository-relative ' +
        'path: `src/auth/service.ts` drafts the file and a section per durable ' +
        'symbol in it, `AuthService.login` drafts that symbol alone. A path ' +
        'wins where a subject names both, because a path is the exact form.',
      variadic: false,
    },
    depth: false,
    flags: [
      {
        name: 'out',
        value: 'path',
        summary: 'write the draft here; `-` is stdout',
        description:
          'Write the draft to this path instead of the derived default, which ' +
          'is `docs/<file>.<symbol>.md` beside the file the subject is ' +
          'declared in. `-` writes to stdout and no file. Either way it ' +
          'refuses to overwrite an existing file and there is no flag to make ' +
          'it: the file it would destroy is a document somebody wrote by hand.',
      },
    ],
    shape: 'document',
    unit: 'section',
    sortedBy: 'the file, then SymbolId',
  },
  {
    name: 'impact',
    summary: 'every symbol a change could reach, against an earlier commit',
    selection:
      'Reach for this before changing shared code, and again before proposing ' +
      'the change as finished. It takes **no subject**: the change is read from ' +
      'the diff against a baseline commit, so it answers what your working tree ' +
      'already reaches, not what editing an arbitrary symbol would reach. To ' +
      'ask that hypothetically, use `callers` or `trace` on the symbol instead.',
    subject: null,
    depth: true,
    flags: [
      {
        name: 'base',
        value: 'ref',
        summary: 'the commit to compare against (default: the merge base)',
        description:
          'The commit to compare against. The default is the merge base with ' +
          'the default branch, and the answer uses the newest stored baseline ' +
          'that is an ancestor of HEAD — `baseline` in the envelope names the ' +
          'one asked for, the one used, and the distance between them. A ' +
          'repository with no baseline still answers, with the absence as a ' +
          'blind spot.',
      },
    ],
    shape: 'list',
    unit: 'symbol',
    sortedBy: 'distance from the change, then SymbolId',
  },
  {
    name: 'doctor',
    summary:
      'every unmet precondition in the repository, and what would clear it',
    selection:
      'Reach for this when an answer looks thinner than the repository ' +
      'deserves and `conditions` reports `syntactic`. It names the unmet ' +
      'precondition and the command that clears it; it never runs that command ' +
      'for you, because codedocs does not execute your repository.',
    subject: null,
    depth: false,
    flags: [
      {
        name: 'measure',
        value: null,
        summary: 'check the signals against the working tree',
        description:
          'Re-run the filesystem signals against the working tree and name ' +
          'where they disagree with what the index stored. It opens no ' +
          'program and analyses nothing, and it is the only way to see an ' +
          'install that is present and incomplete.',
      },
    ],
    shape: 'list',
    unit: 'precondition',
    sortedBy: 'project, then cause',
  },
  {
    name: 'report-bug',
    summary: 'reproduce a failing command and write a report you can paste',
    selection:
      'Reach for this when codedocs itself is wrong — an answer you can show ' +
      'is incorrect, or a command that fails. It re-runs the command and ' +
      'captures the failure happening now. It is never a way to answer a ' +
      'question about the repository.',
    subject: {
      name: 'command',
      description:
        'The failing codedocs command, given after `--`: `report-bug -- trace ' +
        'AuthService.login --depth 3`. It is re-run, and the report carries the ' +
        'envelope of the failure happening now — nothing is read from a log, ' +
        'because codedocs logs nothing.',
      variadic: true,
    },
    depth: false,
    flags: [
      {
        name: 'with-repository',
        value: null,
        summary: 'add the facts that name your code',
        description:
          'Add the facts that name your code: file paths, symbol names, module ' +
          'specifiers, dependency versions and the commit. The default shape ' +
          'carries none of them, and is meant to be safe to paste unread.',
      },
      {
        name: 'out',
        value: 'path',
        summary:
          'where to write it; `-` is stdout (default ./codedocs-report.json)',
        description:
          'Where to write the report. `-` writes it to stdout, which is what an ' +
          'agent pipes. Defaults to ./codedocs-report.json, overwritten each run.',
      },
    ],
    // ADR 0006: a report is one object, so `--limit` has nothing to count and
    // there is no order to fix.
    shape: 'report',
    unit: null,
    sortedBy: null,
  },
]

/**
 * The name a binding that cannot take a space publishes an operation under.
 *
 * One rule rather than a second field: `docs check` becomes `docs_check`, and
 * every other operation is its own name unchanged.
 */
export const toolName = (spec: OperationSpec): string =>
  spec.name.replace(/ /g, '_')

/** Every operation name, for a binding that only needs the list. */
export const OPERATION_NAMES: readonly OperationName[] = OPERATIONS.map(
  (operation) => operation.name,
)

/** One operation's surface by name, or `undefined` if the name is not one. */
export function operationSpec(name: string): OperationSpec | undefined {
  return OPERATIONS.find((operation) => operation.name === name)
}

/** Every operation that takes `flag`, for a binding explaining why one was refused. */
export function operationsTaking(flag: string): readonly OperationSpec[] {
  return OPERATIONS.filter((operation) =>
    operation.flags.some((entry) => entry.name === flag),
  )
}

/** Every per-operation flag any operation declares, which is the closed set of them. */
export const OPERATION_FLAGS: readonly OperationFlag[] = OPERATIONS.flatMap(
  (operation) => operation.flags,
)
