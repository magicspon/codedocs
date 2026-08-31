/**
 * The codedocs core: one operation set, bound by the CLI and later by MCP.
 *
 * ADR 0006 makes the operation the unit of the product. Composition happens
 * inside an operation and never above one, so this surface is deliberately flat.
 */

export {
  analyse,
  type AnalysisTotals,
  type ProjectSummary,
} from './operations/analyse.ts'
export { callees, callers } from './operations/calls.ts'
export { symbol } from './operations/symbol.ts'
export { resolveSubject } from './operations/subject.ts'
export { scopeTo } from './operations/scope.ts'

export {
  answer,
  failure,
  SCHEMA_VERSION,
  type AnswerContext,
  type BlindSpot,
  type Budget,
  type Envelope,
  type EnvelopeError,
  type OperationName,
  type ProjectConditions,
  type ResolvedRequest,
  type Snapshot,
} from './envelope.ts'

export {
  openSession,
  rebuild,
  TOOL_VERSION,
  typescriptVersion,
  type RepairReport,
  type Session,
  type SessionOptions,
} from './session.ts'

export type {
  CallEdge,
  CallerAttribution,
  CallSource,
  Derivation,
  EdgeKind,
  Fidelity,
  FileNode,
  FilePath,
  ImportEdge,
  ProjectNode,
  Provenance,
  SymbolId,
  SymbolKind,
  SymbolNode,
  UnresolvedCall,
  UnresolvedCallCause,
} from './model.ts'

export { STORE_SCHEMA_VERSION, type IndexHeader, type Store } from './store.ts'
export { detectDrift, hasDrift, type Drift } from './drift.ts'
export {
  discoverProjects,
  findRepositoryRoot,
  toRepoPath,
} from './discovery.ts'
