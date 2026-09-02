/**
 * The index: one SQLite file per working tree, holding one snapshot.
 *
 * ADR 0004 chose SQLite over a JSON blob on what scales rather than on what it
 * costs today — a cold process answers one `callers` question in 30 ms against
 * 110 ms, at 48 MB resident against 270 MB, and a two-file edit rewrites 6.8 ms
 * of rows rather than the whole file.
 *
 * This is not a decision to use SQLite's query engine. Operations read rows and
 * answer in code; nothing in the CLI surface may expose SQL, or SQLite becomes
 * an interface we cannot change.
 *
 * Split by concern: `schema.ts` and `enums.ts` are the DDL and the closed-enum
 * code tables, `open.ts` is the `Store` handle's lifecycle, `header.ts` is the
 * `meta` table, `interner.ts` and `statements.ts` are the string-interning and
 * prepared-statement machinery every other file reads through, `write-commit.ts`
 * and `write-rows.ts` are the write path split into transactions and per-table
 * rows, and the `read-*.ts` files are one per family of read. `shared.ts` holds
 * the low-level helpers — the id encoding and the sort comparator — with no
 * dependency on any of it.
 *
 * This file is the module's only public surface.
 */

export { STORE_SCHEMA_VERSION } from './schema.ts'
export { ENUM_CODES } from './enums.ts'
export { openStore, type Store } from './open.ts'
export { readHeader, type IndexHeader } from './header.ts'

export {
  applyWave,
  beginAnalysis,
  commitProject,
  refreshProjects,
  replaceLabels,
  retireFiles,
  writeHeader,
} from './write-commit.ts'

export { readLabels } from './read-labels.ts'

export {
  readBrokenImporters,
  readExportShapes,
  readFiles,
  readImporters,
  readSeenFiles,
} from './read-files.ts'

export {
  readCanonicalProjects,
  readMembershipCounts,
  readProjectFiles,
  readProjects,
  readProjectsForFiles,
  readUnanalysedFiles,
  readUnanalysedProjects,
} from './read-projects.ts'

export {
  readSymbol,
  readSymbolIdAt,
  readSymbols,
  readSymbolsNamed,
  readSymbolsShorthand,
} from './read-symbols.ts'

export {
  readCalleesOf,
  readCalleeSteps,
  readCallersOf,
  type CalleeStep,
} from './read-edges.ts'

export {
  readAllUnresolvedSpecifiers,
  readUnresolvedSpecifiers,
} from './read-specifiers.ts'

export {
  byReference,
  readReferencesFrom,
  readReferencesTo,
} from './read-references.ts'

export {
  readImportsOf,
  readIndexedFiles,
  readMembershipOf,
  readSymbolsIn,
} from './read-file-facts.ts'

export { counts } from './stats.ts'
