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
  readonly name: OperationName
  /** One line. `--help` prints it and the MCP tool list carries it. */
  readonly summary: string
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
    subject: null,
    depth: false,
    flags: [],
    unit: 'project',
    sortedBy: 'tsconfig path',
  },
  {
    name: 'symbol',
    summary: 'every symbol whose name matches a glob',
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
    unit: 'node',
    sortedBy: 'SymbolId, then path',
  },
  {
    name: 'callers',
    summary: 'every call edge into a subject',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'callees',
    summary: 'every call edge out of a subject',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'references',
    summary: 'everything that names a subject without calling it',
    subject: IDENTIFIER,
    depth: false,
    flags: [],
    unit: 'reference edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'file',
    summary: 'what the index holds about one file',
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
    unit: 'file',
    sortedBy: 'path',
  },
  {
    name: 'trace',
    summary: 'every path of calls out of a root',
    subject: {
      name: 'root',
      description:
        'The symbol to walk outward from, in either form a subject takes. The ' +
        'walk is unbounded unless `depth` bounds it.',
      variadic: false,
    },
    depth: true,
    flags: [],
    unit: 'path',
    sortedBy: 'the SymbolId sequence, lexically',
  },
  {
    name: 'impact',
    summary: 'every symbol a change could reach, against an earlier commit',
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
    unit: 'symbol',
    sortedBy: 'distance from the change, then SymbolId',
  },
  {
    name: 'doctor',
    summary:
      'every unmet precondition in the repository, and what would clear it',
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
    unit: 'precondition',
    sortedBy: 'project, then cause',
  },
  {
    name: 'report-bug',
    summary: 'reproduce a failing command and write a report you can paste',
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
    unit: null,
    sortedBy: null,
  },
]

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
