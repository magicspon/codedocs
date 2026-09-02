/**
 * `file` — what the index holds about one file.
 *
 * The relationship set was readable from a symbol and from nowhere else, which
 * left the most ordinary question an agent asks — "what is in this file, and
 * what does it reach" — answerable only by guessing at symbol names first.
 *
 * It reads rows and composes nothing: the projects that globbed it, the fidelity
 * those conditions gave it, what it declares, and the imports either way.
 */

import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type {
  Fidelity,
  FilePath,
  ImportEdge,
  PreconditionCause,
  SymbolNode,
} from '../model.ts'
import {
  readImporters,
  readImportsOf,
  readIndexedFiles,
  readMembershipOf,
  readSymbolsIn,
  type Store,
} from '../store/index.ts'
import { scopeTo } from './scope.ts'

/** ADR 0006's result unit for `file`: everything the index holds about one. */
export interface FileReport {
  readonly path: FilePath
  /** Every project that globs it, sorted. One file may belong to several. */
  readonly projects: readonly FilePath[]
  /** The project its facts were produced in, or `null` where none is recorded. */
  readonly canonicalProject: FilePath | null
  /** The fidelity of that project, or `null` where the file has no analysed project. */
  readonly fidelity: Fidelity | null
  /** Why that fidelity is `syntactic`, or `null`. */
  readonly cause: PreconditionCause | null
  readonly symbols: readonly SymbolNode[]
  /** Every specifier the file writes, with what it resolved to. */
  readonly imports: readonly ImportEdge[]
  /** The files that import it, sorted. */
  readonly importers: readonly FilePath[]
}

/**
 * Report what the index holds about the files a path names.
 *
 * The subject is a repository-relative path, and — per ADR 0006's rule that
 * whatever an operation prints is accepted back — the tail of one: `checkout.ts`
 * finds `src/checkout.ts`. A tail that matches several files is not an error but
 * the same ambiguity a bare symbol name carries, so every match is reported and
 * `request.resolved` names them.
 */
export function file(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  scoping: Scoping,
): Envelope<readonly FileReport[]> {
  const { kept: paths, scope } = applyScope(
    scoping,
    resolvePath(store, subject),
    (path) => path,
  )
  const reports = paths.map((path) => fileReport(store, context, path))

  return answer(
    'file',
    { subject, resolved: paths, limit, depth: null, scope },
    scopeTo(store, context, paths),
    reports,
  )
}

/**
 * One file's row set, assembled.
 *
 * Exported because `evidence` reports the file its subject lives in, and the
 * two operations must not be able to disagree about a file's fidelity or which
 * project is canonical for it.
 */
export function fileReport(
  store: Store,
  context: AnswerContext,
  path: FilePath,
): FileReport {
  const membership = readMembershipOf(store, path)
  // Read off the conditions the session already assembled rather than the
  // project table, so a file's fidelity is the same fact the envelope reports
  // and cannot drift from it.
  const conditions = context.conditions.find(
    (row) => row.project === membership.canonical,
  )
  return {
    path,
    projects: membership.projects,
    canonicalProject: membership.canonical,
    fidelity: conditions?.fidelity ?? null,
    cause: conditions?.cause ?? null,
    symbols: readSymbolsIn(store, path),
    imports: readImportsOf(store, path),
    importers: [...readImporters(store, [path])].sort(),
  }
}

/**
 * The indexed files a subject names, sorted by path.
 *
 * An exact path wins alone: a repository holding both `src/checkout.ts` and
 * `app/src/checkout.ts` must answer about the one that was asked for, not about
 * both because one is a suffix of the other.
 */
function resolvePath(store: Store, subject: string): FilePath[] {
  const normalised = subject.replace(/^\.\//, '')
  const indexed = readIndexedFiles(store)
  if (indexed.includes(normalised)) return [normalised]
  return indexed.filter((path) => path.endsWith(`/${normalised}`))
}
