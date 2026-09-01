# Graph Report - codedocs  (2026-09-01)

## Corpus Check
- 165 files · ~127,570 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1286 nodes · 2201 edges · 95 communities (82 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `090b5348`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Release & CI Workflows|Release & CI Workflows]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_Agent & Documentation Conventions|Agent & Documentation Conventions]]
- [[_COMMUNITY_Dev Tooling Dependencies|Dev Tooling Dependencies]]
- [[_COMMUNITY_Package Scripts & Metadata|Package Scripts & Metadata]]
- [[_COMMUNITY_Static Analysis Principles|Static Analysis Principles]]
- [[_COMMUNITY_CodeGuide Product Architecture|CodeGuide Product Architecture]]
- [[_COMMUNITY_Renovate Dependency Config|Renovate Dependency Config]]
- [[_COMMUNITY_Changesets Release Config|Changesets Release Config]]
- [[_COMMUNITY_Oxlint Rules Config|Oxlint Rules Config]]
- [[_COMMUNITY_Spell Check Config|Spell Check Config]]
- [[_COMMUNITY_Code Formatting Config|Code Formatting Config]]
- [[_COMMUNITY_Claude Permissions Settings|Claude Permissions Settings]]
- [[_COMMUNITY_Renovate Changeset Script|Renovate Changeset Script]]
- [[_COMMUNITY_Yalc Local Publish Script|Yalc Local Publish Script]]
- [[_COMMUNITY_Cspell Word Sorting Script|Cspell Word Sorting Script]]
- [[_COMMUNITY_Commitlint Configuration|Commitlint Configuration]]
- [[_COMMUNITY_AI Implementation Planning|AI Implementation Planning]]
- [[_COMMUNITY_Vitest Test Config|Vitest Test Config]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]

## God Nodes (most connected - your core abstractions)
1. `FilePath` - 32 edges
2. `openSession()` - 31 edges
3. `compilerOptions` - 21 edges
4. `run` - 20 edges
5. `repairWave()` - 16 edges
6. `rebuild()` - 16 edges
7. `codedocs` - 16 edges
8. `SymbolNode` - 15 edges
9. `scripts` - 14 edges
10. `parseConfig()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `fallow` --semantically_similar_to--> `Static Analysis Layer`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Fallow PR Audit Workflow` --semantically_similar_to--> `AI Code Review / Verification`  [INFERRED] [semantically similar]
  .github/workflows/fallow.yml → docs/REQUIREMENTS.md
- `graphify` --semantically_similar_to--> `Code Graph`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Fallow Is Syntactic, Not Semantic` --semantically_similar_to--> `Deterministic vs Inferred Results`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `version-packages Lockfile Resync` --shares_data_with--> `pnpm Workspace Configuration`  [INFERRED]
  .github/workflows/release.yaml → pnpm-workspace.yaml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CodeGuide Layered Architecture** — docs_requirements_codeguide_core, docs_requirements_cli, docs_requirements_mcp_server, docs_requirements_desktop_application [EXTRACTED 1.00]
- **Codebase Intelligence Substrate** — docs_requirements_static_analysis_layer, docs_requirements_code_graph, docs_requirements_document_layer, docs_requirements_internal_representation, docs_requirements_adapter_pattern [EXTRACTED 1.00]
- **Pull Request Quality Gate** — workflows_ci_pipeline, workflows_fallow_audit, agents_fallow, cspell_words_dictionary, pnpm_workspace_config [INFERRED 0.85]

## Communities (95 total, 13 thin omitted)

### Community 0 - "Release & CI Workflows"
Cohesion: 0.19
Nodes (14): Single-Context Repo Layout, fallow, Fallow Exit Code Convention, Project Spelling Dictionary, pnpm Workspace Configuration, Example Apps Consume Packages By Link, Minimum Release Age Policy, Built Dependency Allowlist (+6 more)

### Community 1 - "TypeScript Compiler Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, declaration, erasableSyntaxOnly, isolatedDeclarations, isolatedModules, lib, module (+14 more)

### Community 2 - "Agent & Documentation Conventions"
Cohesion: 0.12
Nodes (18): Code Comment Conventions, Architecture Decision Records, Before exploring, read these, CONTEXT.md Glossary, Domain Docs, File structure, Flag ADR conflicts, Lazy Domain Doc Creation (+10 more)

### Community 3 - "Dev Tooling Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @changesets/changelog-github, @changesets/cli, @codedocs/cli, @commitlint/cli, @commitlint/config-conventional, @commitlint/types, oxfmt (+7 more)

### Community 4 - "Package Scripts & Metadata"
Cohesion: 0.14
Nodes (14): scripts, bench, bench:report, check, format, lint, prepare, release (+6 more)

### Community 5 - "Static Analysis Principles"
Cohesion: 0.17
Nodes (12): AI-Provider Agnostic, ast-grep, Codebase Intelligence Layer, CodeGuide, Do Not Reinvent The Wheel, Incremental Analysis And Caching, Local First, No Custom Static-Analysis Engine (+4 more)

### Community 6 - "CodeGuide Product Architecture"
Cohesion: 0.28
Nodes (9): Tool Adapter Pattern, CodeGuide CLI, CodeGuide Core, codeguide doctor, CodeGuide Desktop, Normalised Internal Representation, One-Time Pricing Model, codeguide report-bug (+1 more)

### Community 7 - "Renovate Dependency Config"
Cohesion: 0.11
Nodes (17): commitMessageAction, commitMessagePrefix, commitMessageTopic, dependencyDashboard, description, extends, ignorePaths, packageRules (+9 more)

### Community 8 - "Changesets Release Config"
Cohesion: 0.15
Nodes (12): access, baseBranch, changelog, commit, fixed, format, ignore, privatePackages (+4 more)

### Community 9 - "Oxlint Rules Config"
Cohesion: 0.17
Nodes (11): categories, correctness, env, builtin, ignorePatterns, options, typeAware, overrides (+3 more)

### Community 10 - "Spell Check Config"
Cohesion: 0.22
Nodes (8): dictionaries, dictionaryDefinitions, ignorePaths, ignoreRegExpList, language, $schema, version, cspell

### Community 11 - "Code Formatting Config"
Cohesion: 0.22
Nodes (8): ignorePatterns, overrides, printWidth, $schema, semi, singleQuote, sortPackageJson, trailingComma

### Community 12 - "Claude Permissions Settings"
Cohesion: 0.29
Nodes (6): permissions, allow, ask, defaultMode, deny, $schema

### Community 13 - "Renovate Changeset Script"
Cohesion: 0.33
Nodes (4): alreadyRecorded, changesetDir, [packageFile, depType, depName], RELEASABLE_DEP_TYPES

### Community 14 - "Yalc Local Publish Script"
Cohesion: 0.09
Nodes (38): ATTRIBUTIONS, byEndpoints(), CAUSES, code(), compare(), DERIVATIONS, EdgeRow, FIDELITIES (+30 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (12): codedocs never transmits it, and that is checked, Consequences, Considered Options, Exit codes, Free text is the hole no field rule closes, Hashing is not on the table, `report-bug` reproduces the failure, writes two shapes, and the safe one is the default, The field list (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (15): AnalysisSession, ANONYMOUS_FUNCTION, CALLABLE_KIND, collectSpecifiers(), DECLARATION_SPACE, DeclarationResolver, dynamicSpecifier(), FUNCTION_INITIALISER (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (74): Claim, SymbolSweep, analyse(), AnalysisTotals, ProjectSummary, callees(), callers(), collect() (+66 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (66): Command, failed(), OPTIONS, parse(), ParsedArgs, parseOptions(), resolveColor(), resolveDepth() (+58 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): 10. Success criteria, 11. Where the detail lives, 1. What codedocs is, 2. Who it is for, 3. The questions, 4. What codedocs is not, 5. Principles, 6. The operation surface (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (26): 1. Method, and what "verified" means here, 2. The required facts, 3. The candidates, 4. The matrix, 5. Cost, 6. Facts with no producer, 7. Verdict, 8. Licensing note (§30) (+18 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (25): 1. `tsc --incremental` and `.tsbuildinfo`, 2. TypeScript project references, 3. `LanguageService` + `DocumentRegistry` (TypeScript 6), 4. Oxc and ast-grep — what is lost without cross-file resolution, 5. `typescript-go` / tsgo — performance and embeddability, 6. How Nx, Turborepo, Bazel and Rush decide what changed, 7. The recommended algorithm, and the traps in it, Embeddability (+17 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (23): 1. What TypeScript 7.0.2 actually exposes, 2. The call-graph primitive, and what it gets right, 3. What the chosen backend cannot do, 4. The algorithm: sweep call sites, do not query symbols, 5. The numbers, 6. The unprepared run, and what it says about ADR 0001, 7. Consequences for the open tickets, 8. What was not measured (+15 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (23): 1. SCIP (Sourcegraph → `scip-code`), 2. LSIF (Microsoft) — SCIP's predecessor, 3. Stack Graphs (GitHub), 4. Kythe (Google), 5. Glean (Meta), 6. CodeQL (GitHub), A. Nobody has solved cross-commit symbol identity, B. Transmission format ≠ storage format (+15 more)

### Community 28 - "Community 28"
Cohesion: 0.10
Nodes (19): ast-grep — CLEARED, Attribution: what codedocs must actually ship, Copyleft in the transitive tree, Distribution assumption, Does subprocess vs library change the answer?, Findings, Graphify — AMBIGUOUS (needs a human call), Licence and redistribution audit of candidate analysis dependencies (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.20
Nodes (4): Step, Calendar, pageObject, retry()

### Community 30 - "Community 30"
Cohesion: 0.19
Nodes (13): Changesets Versioning, codedocs Agent Instructions, GitHub Issue Tracker Convention, GitHub Default Label Distinction, Canonical Triage Labels, CLAUDE.md Entry Point, Bot PAT Requirement, GitHub Packages Publishing (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (13): bin, codedocs, dependencies, @codedocs/core, devDependencies, @types/node, exports, name (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (11): dependencies, typescript, devDependencies, @types/node, exports, name, private, scripts (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (10): An interrupted build leaves a partial index, not an invalid one, Concurrency, which SQLite mostly decides, Consequences, Considered Options, Detecting drift, One index file is one snapshot, The index is one SQLite file per working tree, holding one snapshot, that heals itself, What invalidates what (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (10): Budget, and what a default means, Consequences, Considered Options, Errors and exit codes, Naming a subject, One operation, three bindings, and one envelope on every answer, The envelope, The four rules both renderers obey (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (10): Analysis honesty, Classification, codedocs, Documentation, Language, Observing the repository, The index on disk, The internal representation (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (9): Claim coverage, Consequences, Considered Options, Discovery, and `docs affected`, Documents make claims, and every verdict has exactly one source, Pointers cannot decide staleness, measured, The four verdicts, What a claim is (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.24
Nodes (6): bootTotal, checkout(), loadPayments(), charge(), Gateway, StripeGateway

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (6): Agent skills, codedocs, Comments, Domain docs, Issue tracker, Triage labels

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): compilerOptions, jsx, module, moduleResolution, noEmit, strict, target, include

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (7): A baseline built under different analysis conditions, A baseline is recorded by normal use, never constructed, and never leaves the machine, Capture, and why there is no command, Consequences, Considered Options, Retention, Which baseline an answer uses

### Community 41 - "Community 41"
Cohesion: 0.25
Nodes (7): Conventions, Issue tracker: GitHub, Research findings, Sub-issues and dependencies, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (7): engines, node, name, packageManager, private, type, version

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (6): Consequences, Considered Options, Continuity is two inferred matchers, ranked by evidence and never by a score, The candidate, The derivations and their precedence, The two matchers

### Community 44 - "Community 44"
Cohesion: 0.06
Nodes (61): freeze(), GhIssue, seeds, stripTemplateComments(), armRow(), ARMS, Cell, delta() (+53 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (20): callers and callees, codedocs, codedocs and fallow, Configuration, Design documents, Development, Flags, Install (+12 more)

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (5): Consequences, Considered Options, Symbol identity is a normalised SCIP string, scoped to one snapshot, The edge kinds, The node types

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (5): Classification is a label layer on two axes, recomputed on every run, Consequences, Considered Options, The signals, The two axes

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (5): compilerOptions, types, exclude, extends, include

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (27): 10. Persistent documentation, 11. Documentation validation, 12. Documentation impact analysis, 13. AI coding agent integration, 14. AI implementation planning, 15. Existing-pattern discovery, 16. Code review / AI verification, 17. Change impact analysis (+19 more)

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, include

### Community 51 - "Community 51"
Cohesion: 0.18
Nodes (9): clearFile(), ENUM_CODES, nodeId(), partsOf(), prepared(), readCalleesOf(), readCallersOf(), readSymbolIdAt() (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): Consequences, Considered Options, Preconditions lower fidelity; honesty is evidence, not a score

### Community 53 - "Community 53"
Cohesion: 0.16
Nodes (23): analyse(), openAnalysis(), Config, currentCommit(), discoverProjects(), expandProjectGlobs(), SKIP_DIRS, detectDrift() (+15 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (27): findRepositoryRoot(), Drift, driftedPaths(), hasDrift(), classifySpecifiers(), fidelityOf(), anythingOutstanding(), movedProjects() (+19 more)

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (8): Affected tests are not an operation, Consequences, Considered Options, Phase 5 collapses to one operation, The boundary with fallow, The order the rest is built in, The questions codedocs is for, The reader is a developer, and the boundary is fallow

### Community 64 - "Community 64"
Cohesion: 0.60
Nodes (4): countdown(), ping(), pong(), twice()

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (12): 10. What changes, 1. Two discovery rules, and they see the same files, 2. How much cal.com's projects overlap, 3. The 81,888, decomposed, 4. Every call site, on both sides, 5. Edge for edge, not count for count, 6. The two edges canonicalisation cannot see, 7. A single-project control (+4 more)

### Community 66 - "Community 66"
Cohesion: 0.23
Nodes (12): Graph Outputs Are Derived Artifacts, graphify, AI Code Review / Verification, AI Context Efficiency, Change Impact Analysis, Code Graph, Documentation Impact Analysis, Graphify (tool) (+4 more)

### Community 67 - "Community 67"
Cohesion: 0.25
Nodes (7): compilerOptions, module, moduleResolution, noEmit, strict, target, include

### Community 68 - "Community 68"
Cohesion: 0.10
Nodes (31): Answer, answered(), ArgumentSchema, argvFor(), callTool(), DEPTH_ARGUMENT, dispatch(), failed() (+23 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (10): `codedocs.jsonc` holds facts codedocs cannot determine, and nothing else, Consequences, Considered Options, `discover`, which is what `discovery.ts`'s project-path TODO actually wanted, Discovery, and a repository root that means one thing, Parsing, versioning, and unknown keys, `remediations`, which is [#17](https://github.com/magicspon/codedocs/issues/17)'s residue, The file (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.16
Nodes (17): openFor(), repairWave(), runWave(), seedFrontier(), stamp(), applyWave(), groupByProject(), pathId() (+9 more)

### Community 71 - "Community 71"
Cohesion: 0.21
Nodes (5): eager(), lazily(), Typed, reexported(), statically()

### Community 72 - "Community 72"
Cohesion: 0.12
Nodes (33): AUTHORSHIPS, blank(), blankComments(), blankTrailingCommas(), ConfigError, configSentence(), DEFAULT_CONFIG, describe() (+25 more)

### Community 73 - "Community 73"
Cohesion: 0.25
Nodes (7): compilerOptions, module, moduleResolution, noEmit, strict, target, include

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (7): compilerOptions, module, moduleResolution, noEmit, strict, target, include

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (7): compilerOptions, module, moduleResolution, noEmit, strict, target, include

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (15): attribute(), callSegment(), collectCallSites(), declarationKey(), descriptorPath(), isCallable(), lineOf(), lookup() (+7 more)

### Community 81 - "Community 81"
Cohesion: 0.29
Nodes (12): AdapterResult, DeclarationSite, CallEdge, ImportEdge, ProjectNode, SpecifierSite, UnresolvedCall, UnresolvedSpecifier (+4 more)

### Community 82 - "Community 82"
Cohesion: 0.24
Nodes (10): CallSite, ExtractRequest, OwnedFile, View, FilePath, Lookups, ProjectPreflight, ProjectSlice (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (9): Consequences, Considered Options, How preflight reaches an answer, Preflight is filesystem work, and the type checker's diagnostics were never a signal, Preflight's two halves, The environment fingerprint, made computable, The four signals, and the shape of the fourth, What `doctor` runs (+1 more)

### Community 84 - "Community 84"
Cohesion: 0.11
Nodes (34): asRecord(), asStrings(), baseOf(), canonical(), causeOf(), configFor(), declaresInstallScript(), DEFAULT_EXCLUDES (+26 more)

### Community 85 - "Community 85"
Cohesion: 1.00
Nodes (3): moduleFileOf(), sweepFileImports(), sweepImports()

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (7): Running it, The cases, The localization benchmark, The task, The two arms, What is measured, What this does not show

### Community 87 - "Community 87"
Cohesion: 0.38
Nodes (7): exportShapeOf(), extractFrom(), ownedFiles(), pickProject(), sweepExportShapes(), sweepSymbols(), toRepoPath()

### Community 88 - "Community 88"
Cohesion: 0.29
Nodes (7): 32. Initial MVP, Phase 1 — Analysis, Phase 2 — CLI, Phase 3 — Documentation, Phase 4 — AI, Phase 5 — AI coding assistance, Phase 6 — Desktop

### Community 90 - "Community 90"
Cohesion: 0.33
Nodes (6): 3.1 Do not reinvent the wheel, 3.2 Local first, 3.3 Files are the source of truth, 3.4 AI-provider agnostic, 3.5 Evidence over speculation, 3. Product principles

### Community 91 - "Community 91"
Cohesion: 0.40
Nodes (5): 6. Static analysis, Project information, Relationships, Repository structure, Symbols

### Community 92 - "Community 92"
Cohesion: 0.50
Nodes (4): 1.1 Product vision, 1. Introduction, 2. Core proposition, CodeGuide — Product Requirements Document

### Community 93 - "Community 93"
Cohesion: 0.67
Nodes (3): 27. Reliability, Deterministic results, Inferred results

### Community 94 - "Community 94"
Cohesion: 0.67
Nodes (3): 31. Pricing, CodeGuide CLI, CodeGuide Desktop

## Ambiguous Edges - Review These
- `Release Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/release.yaml · relation: conceptually_related_to
- `Renovate Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/renovate.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **562 isolated node(s):** `$schema`, `baseBranch`, `access`, `format`, `changelog` (+557 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Release Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Renovate Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `openSession()` connect `Community 55` to `Community 70`, `Community 72`, `Yalc Local Publish Script`, `Community 53`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Step` connect `Community 29` to `Community 22`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `$schema`, `baseBranch`, `access` to the rest of the system?**
  _575 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TypeScript Compiler Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Agent & Documentation Conventions` be split into smaller, more focused modules?**
  _Cohesion score 0.11695906432748537 - nodes in this community are weakly interconnected._