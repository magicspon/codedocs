/**
 * The codedocs core: one operation set, bound by the CLI and later by MCP.
 *
 * ADR 0006 makes the operation the unit of the product. Composition happens
 * inside an operation and never above one, so this surface is deliberately flat.
 */

export {
  analyse,
  type AnalysisTotals,
  type BaselineRequest,
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
  evidence,
  type EvidenceEnvelope,
  type EvidenceKind,
  type EvidenceOptions,
  type EvidenceReport,
} from './operations/evidence.ts'
export { references } from './operations/references.ts'
export {
  docsAffected,
  docsCheck,
  type DocsEnvelope,
  type DocsOptions,
} from './operations/docs.ts'
// The whole result type of both public functions, not just its outermost layer:
// a caller of `discoverDocuments` that cannot name a `ParsedDocument`, or of
// `parseClaim` that cannot name what it got back, has half an API.
export {
  discoverDocuments,
  parseClaim,
  type Claim,
  type ClaimFault,
  type ClaimReason,
  type ClaimReport,
  type ClaimSite,
  type ClaimSyntaxError,
  type CountPredicate,
  type Coverage,
  type DocumentFault,
  type DocumentReport,
  type DocumentScan,
  type DocumentSection,
  type LinkReport,
  type ParsedClaim,
  type ParsedDocument,
  type ProseLink,
  type RelationPredicate,
  type SectionReport,
  type Verdict,
} from './docs/index.ts'
export {
  continuationOf,
  CANDIDATE_LIMIT,
  type Candidate,
  type Continuation,
} from './continuity/index.ts'
export {
  impact,
  type BaselineUsed,
  type ImpactedSymbol,
  type ImpactEnvelope,
  type ImpactKind,
  type ImpactOptions,
} from './operations/impact.ts'
export { changedFiles, type Change } from './operations/changes.ts'
export { file, type FileReport } from './operations/file.ts'
export {
  classification,
  type Classification,
  type ClassificationCount,
  type Disagreement as ClassificationDisagreement,
} from './operations/classification.ts'
export {
  doctor,
  type DoctorEnvelope,
  type DoctorOptions,
  type BaselineReport,
  type HeldBaseline,
  type IndexReport,
  type Precondition,
  type SpecifierEvidence,
} from './operations/doctor.ts'
export {
  measureProjects,
  type Disagreement,
  type MeasuredSignal,
} from './operations/measure.ts'
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
  coarseClassOf,
  fileOf,
  isSymbolId,
  shorthandOf,
  splitShorthand,
  type DescriptorClass,
  type PackageRef,
} from './symbol-id.ts'

export {
  answer,
  assembled,
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
  toolName,
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
  Label,
  LabelAxis,
  LabelValue,
  ImportEdge,
  PreconditionCause,
  ProjectNode,
  Provenance,
  ReferenceEdge,
  ReferenceKind,
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
export {
  applyScope,
  DEFAULT_SCOPE,
  effective,
  excludedBy,
  labelFiles,
  parseFilter,
  scopeOf,
  unfiltered,
  UNSCOPED,
  type EffectiveLabels,
  type LabelFilter,
  type LabelPass,
  type Scope,
  type Scoping,
} from './labels/index.ts'

export {
  BASELINE_DIR,
  capture,
  chooseBaseline,
  listBaselines,
  openBaseline,
  type BaselineChoice,
  type Capture,
  type StoredBaseline,
} from './baseline/index.ts'

export { detectDrift, hasDrift, type Drift } from './drift.ts'
export {
  absentDependencies,
  fidelityOf,
  installCommand,
  preflightProjects,
  type ProjectPreflight,
} from './preflight/index.ts'
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
} from './config/index.ts'
