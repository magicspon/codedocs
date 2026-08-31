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
  /** ADR 0006's result unit, which is what `--limit` counts. */
  readonly unit: string
  /** ADR 0006's sort key. Part of the contract, not an implementation detail. */
  readonly sortedBy: string
}

/** A subject is anything an operation prints as an identifier. */
const IDENTIFIER: SubjectSpec = {
  name: 'subject',
  description:
    'Anything codedocs prints as an identifier: `src/auth/service.ts#AuthService.login` ' +
    'names one symbol exactly, and `AuthService.login` may resolve to several — in ' +
    'which case the answer is their union and `request.resolved` names them.',
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
    },
    depth: false,
    unit: 'node',
    sortedBy: 'SymbolId, then path',
  },
  {
    name: 'callers',
    summary: 'every call edge into a subject',
    subject: IDENTIFIER,
    depth: false,
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'callees',
    summary: 'every call edge out of a subject',
    subject: IDENTIFIER,
    depth: false,
    unit: 'call edge',
    sortedBy: '(source, target, kind, site)',
  },
  {
    name: 'trace',
    summary: 'every path of calls out of a root',
    subject: {
      name: 'root',
      description:
        'The symbol to walk outward from, in either form a subject takes. The ' +
        'walk is unbounded unless `depth` bounds it.',
    },
    depth: true,
    unit: 'path',
    sortedBy: 'the SymbolId sequence, lexically',
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
