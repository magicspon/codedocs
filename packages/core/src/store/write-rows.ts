/**
 * The per-table row writers `write-commit.ts` calls inside its transactions.
 */

import type {
  CallEdge,
  FileNode,
  FilePath,
  ImportEdge,
  Label,
  ProjectNode,
  ReferenceEdge,
  SymbolNode,
  UnresolvedCall,
  UnresolvedSpecifier,
} from '../model.ts'
import type { DeclarationSite } from '../adapter/ts7/index.ts'
import {
  ATTRIBUTIONS,
  CAUSES,
  code,
  DERIVATIONS,
  FIDELITIES,
  KINDS,
  LABEL_AXES,
  LABEL_VALUES,
  PRECONDITION_CAUSES,
  PROVENANCES,
  REFERENCE_KINDS,
} from './enums.ts'
import { internerFor } from './interner.ts'
import type { Store } from './open.ts'

/** The rows one file contributes, which the wave replaces wholesale. */
export interface FileFacts {
  readonly files: readonly FileNode[]
  readonly exportShapes: ReadonlyMap<FilePath, string>
  readonly symbols: readonly SymbolNode[]
  /** The declaration offsets the symbol rows cannot carry. See `declaration`. */
  readonly declarations: readonly DeclarationSite[]
  readonly callEdges: readonly CallEdge[]
  /** Every non-call reference, per site, as `call_edge` holds every call. */
  readonly referenceEdges: readonly ReferenceEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly importEdges: readonly ImportEdge[]
  /**
   * ADR 0009's signal 4, per site and keyed by file.
   *
   * Per site because the wave's write unit is one file: a project-level count
   * would need read-modify-write across files, and would go wrong exactly where
   * ADR 0004 permits a partial build committed per project. Deduplicating 306
   * copies of one specifier into one fact is the operation's job.
   */
  readonly unresolvedSpecifiers: readonly UnresolvedSpecifier[]
}

export function writeProject(store: Store, project: ProjectNode): void {
  store.db
    .prepare(
      `insert or replace into project
       (path_id, fidelity, root_file_count, analysed_at, fingerprint, cause,
        postinstall)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      internerFor(store).path(project.configPath),
      code(FIDELITIES, project.fidelity, 'fidelity'),
      project.rootFileCount,
      project.analysedAt,
      project.fingerprint,
      project.cause === null
        ? null
        : code(PRECONDITION_CAUSES, project.cause, 'precondition cause'),
      project.postinstall ? 1 : 0,
    )
}

/** `seen_file` is what keeps drift finite; see `AnalysisStart.seenFiles`. */
export function writeSeenFiles(
  store: Store,
  seenFiles: readonly FilePath[],
): void {
  const intern = internerFor(store)
  const seen = store.db.prepare(
    'insert or ignore into seen_file (path_id) values (?)',
  )
  for (const path of seenFiles) seen.run(intern.path(path))
}

export function writeMembership(
  store: Store,
  configPath: FilePath,
  files: readonly FileNode[],
): void {
  writeMembershipPaths(
    store,
    configPath,
    files.map((file) => file.path),
  )
}

export function writeMembershipPaths(
  store: Store,
  configPath: FilePath,
  paths: readonly FilePath[],
): void {
  const intern = internerFor(store)
  const project = intern.path(configPath)
  const membership = store.db.prepare(
    'insert or ignore into file_project (file_id, project_id, canonical) values (?, ?, 1)',
  )
  for (const path of paths) membership.run(intern.path(path), project)
}

/**
 * Replace the whole label set.
 *
 * Wholesale rather than per file, because ADR 0003 recomputes the layer on every
 * analysis rather than invalidating it: incremental invalidation buys under a
 * second on cal.com and costs a staleness bug, where an edited `codedocs.jsonc`
 * leaves old labels behind.
 */
export function writeLabels(store: Store, labels: readonly Label[]): void {
  const intern = internerFor(store)
  store.db.exec('delete from label')
  const row = store.db.prepare(
    `insert or replace into label
       (node_id, axis, value, provenance, derivation)
       values (?, ?, ?, ?, ?)`,
  )
  for (const label of labels) {
    row.run(
      intern.node(label.node),
      code(LABEL_AXES, label.axis, 'label axis'),
      code(LABEL_VALUES, label.value, 'label value'),
      code(PROVENANCES, label.provenance, 'provenance'),
      code(DERIVATIONS, label.derivation, 'derivation'),
    )
  }
}

/** One project's facts, in one transaction. */
export function writeFileFacts(store: Store, facts: FileFacts): void {
  writeFileRows(store, facts)
  writeSymbols(store, facts.symbols)
  writeDeclarations(store, facts.declarations)
  writeCallEdges(store, facts.callEdges)
  writeReferenceEdges(store, facts.referenceEdges)
  writeUnresolvedCalls(store, facts.unresolvedCalls)
  writeImportEdges(store, facts.importEdges)
  writeUnresolvedSpecifiers(store, facts.unresolvedSpecifiers)
}

/** The file row carries both hashes: content for drift, export shape for the wave. */
function writeFileRows(store: Store, facts: FileFacts): void {
  const intern = internerFor(store)
  const file = store.db.prepare(
    `insert or replace into file
       (path_id, content_hash, size, mtime_ms, export_shape_hash)
       values (?, ?, ?, ?, ?)`,
  )
  for (const row of facts.files) {
    file.run(
      intern.path(row.path),
      row.contentHash,
      row.size,
      row.mtimeMs,
      facts.exportShapes.get(row.path) ?? '',
    )
  }
}

function writeSymbols(store: Store, symbols: readonly SymbolNode[]): void {
  const intern = internerFor(store)
  // `or ignore` is a safety net rather than the collapse: the adapter now emits
  // one row per id and says whether several declarations claim it.
  const symbol = store.db.prepare(
    `insert or ignore into symbol
       (node_id, path_id, name, kind, start, line, durable, callable,
        collisions)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of symbols) {
    // `path_id` repeats the file already inside `node`, and is derived from the
    // same interning call so the two cannot disagree. It buys `symbol_site`,
    // which is what makes a file's rows deletable without a table scan.
    symbol.run(
      intern.node(row.id),
      intern.path(row.file),
      row.name,
      code(KINDS, row.kind, 'kind'),
      row.start,
      row.line,
      row.durable ? 1 : 0,
      row.callable ? 1 : 0,
      row.collisions,
    )
  }
}

/**
 * The declaration offsets a symbol row has no room for.
 *
 * ADR 0002 collapses overloads and declaration merging into one symbol, and the
 * row records the first declaration's offset. `readSymbolIdAt` joins on an
 * offset, so without these an edge into the *second* overload — or into the
 * static twin of an instance method — resolves in memory and nowhere else. That
 * cost 20 of `microsoft/vscode`'s 728,717 edges the moment a build stopped
 * holding every project in memory at once.
 */
function writeDeclarations(
  store: Store,
  declarations: readonly DeclarationSite[],
): void {
  const intern = internerFor(store)
  const site = store.db.prepare(
    'insert or ignore into declaration (path_id, start, node_id) values (?, ?, ?)',
  )
  for (const row of declarations) {
    site.run(intern.path(row.file), row.start, intern.node(row.id))
  }
}

function writeCallEdges(store: Store, callEdges: readonly CallEdge[]): void {
  const intern = internerFor(store)
  // No column says whether a source is a symbol or a file: a file source is the
  // node with an empty descriptor path, and `attribution` already names the case.
  const edge = store.db.prepare(
    `insert into call_edge
       (from_id, to_id, attribution, path_id, line, provenance, derivation)
       values (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of callEdges) {
    edge.run(
      intern.node(row.from),
      intern.node(row.to),
      code(ATTRIBUTIONS, row.attribution, 'attribution'),
      intern.path(row.file),
      row.line,
      code(PROVENANCES, row.provenance, 'provenance'),
      code(DERIVATIONS, row.derivation, 'derivation'),
    )
  }
}

/**
 * The reference rows, which are the call rows plus a kind.
 *
 * A table of their own rather than a `kind` column on `call_edge`: every read
 * of the call graph would then have to remember to filter it, and the one that
 * forgot would answer `callers` with type annotations.
 */
function writeReferenceEdges(
  store: Store,
  referenceEdges: readonly ReferenceEdge[],
): void {
  const intern = internerFor(store)
  const edge = store.db.prepare(
    `insert into reference_edge
       (from_id, to_id, kind, attribution, path_id, line, provenance,
        derivation)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of referenceEdges) {
    edge.run(
      intern.node(row.from),
      intern.node(row.to),
      code(REFERENCE_KINDS, row.kind, 'reference kind'),
      code(ATTRIBUTIONS, row.attribution, 'attribution'),
      intern.path(row.file),
      row.line,
      code(PROVENANCES, row.provenance, 'provenance'),
      code(DERIVATIONS, row.derivation, 'derivation'),
    )
  }
}

function writeUnresolvedCalls(
  store: Store,
  unresolvedCalls: readonly UnresolvedCall[],
): void {
  const intern = internerFor(store)
  const unresolved = store.db.prepare(
    'insert into unresolved_call (path_id, line, cause, name) values (?, ?, ?, ?)',
  )
  for (const row of unresolvedCalls) {
    unresolved.run(
      intern.path(row.file),
      row.line,
      code(CAUSES, row.cause, 'cause'),
      row.name,
    )
  }
}

function writeImportEdges(
  store: Store,
  importEdges: readonly ImportEdge[],
): void {
  const intern = internerFor(store)
  const imported = store.db.prepare(
    'insert or replace into file_import (from_id, specifier, to_id) values (?, ?, ?)',
  )
  for (const row of importEdges) {
    imported.run(
      intern.path(row.from),
      row.specifier,
      row.to === null ? null : intern.path(row.to),
    )
  }
}

function writeUnresolvedSpecifiers(
  store: Store,
  specifiers: readonly UnresolvedSpecifier[],
): void {
  const intern = internerFor(store)
  const row = store.db.prepare(
    `insert into unresolved_specifier (path_id, specifier, line, cause)
     values (?, ?, ?, ?)`,
  )
  for (const specifier of specifiers) {
    row.run(
      intern.path(specifier.file),
      specifier.specifier,
      specifier.line,
      code(PRECONDITION_CAUSES, specifier.cause, 'precondition cause'),
    )
  }
}
