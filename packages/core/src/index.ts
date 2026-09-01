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
export {
  trace,
  type PathTerminus,
  type TracePath,
  type TraceStep,
} from './operations/trace.ts'
export { symbol } from './operations/symbol.ts'
export {
  REPORT_FILE,
  reportBug,
  type BlindSpotReason,
  type CodedocsFacts,
  type ConfigReport,
  type Disclosure,
  type IndexFacts,
  type MachineFacts,
  type PackageManager,
  type ProjectEnvironment,
  type Report,
  type ReportedError,
  type ReportEnvelope,
  type Reproduction,
  type ReproductionFacts,
  type SpecifierFact,
  type SpecifierTotals,
} from './operations/report-bug.ts'
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
  type ErrorCode,
  type ErrorParams,
  type OperationName,
  type ProjectConditions,
  type ResolvedRequest,
  type Snapshot,
} from './envelope.ts'

export {
  OPERATION_FLAGS,
  OPERATION_NAMES,
  OPERATIONS,
  operationSpec,
  operationsTaking,
  type OperationFlag,
  type OperationSpec,
  type SubjectSpec,
} from './manifest.ts'

export {
  openSession,
  rebuild,
  TOOL_VERSION,
  typescriptVersion,
  type RepairReport,
  type Session,
  type SessionOptions,
} from './session/index.ts'

export type {
  Authorship,
  CallEdge,
  CallerAttribution,
  CallSite,
  CallSource,
  Derivation,
  EdgeKind,
  Fidelity,
  FileNode,
  FilePath,
  ImportEdge,
  PreconditionCause,
  ProjectNode,
  Provenance,
  Role,
  SymbolId,
  SymbolKind,
  SymbolNode,
  UnresolvedCall,
  UnresolvedCallCause,
} from './model.ts'

export {
  STORE_SCHEMA_VERSION,
  type CalleeStep,
  type IndexHeader,
  type Store,
} from './store/index.ts'
export { detectDrift, hasDrift, type Drift } from './drift.ts'
export {
  fidelityOf,
  preflightProjects,
  type ProjectPreflight,
} from './preflight.ts'
export {
  discoverProjects,
  findRepositoryRoot,
  toRepoPath,
} from './discovery.ts'
export {
  CONFIG_FILE,
  ConfigError,
  configFacts,
  configSentence,
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig,
  remediationFor,
  type ClassifyRule,
  type Config,
  type ConfigFacts,
  type ConfigRefusal,
  type Discover,
  type Remediation,
} from './config.ts'
