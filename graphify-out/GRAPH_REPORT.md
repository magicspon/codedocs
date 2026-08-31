# Graph Report - codedocs  (2026-08-31)

## Corpus Check
- 90 files · ~71,521 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 827 nodes · 1272 edges · 65 communities (55 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fee8958c`
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

## God Nodes (most connected - your core abstractions)
1. `FilePath` - 23 edges
2. `compilerOptions` - 21 edges
3. `openSession()` - 20 edges
4. `run` - 13 edges
5. `Incremental re-analysis with existing TypeScript tooling` - 13 edges
6. `scripts` - 12 edges
7. `SymbolNode` - 12 edges
8. `repairWave()` - 12 edges
9. `3. The candidates` - 12 edges
10. `Prior art: how existing code-intelligence indexes model and persist symbols` - 12 edges

## Surprising Connections (you probably didn't know these)
- `graphify` --semantically_similar_to--> `Code Graph`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `fallow` --semantically_similar_to--> `Static Analysis Layer`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Fallow PR Audit Workflow` --semantically_similar_to--> `AI Code Review / Verification`  [INFERRED] [semantically similar]
  .github/workflows/fallow.yml → docs/REQUIREMENTS.md
- `Code Docs` --conceptually_related_to--> `CodeGuide`  [AMBIGUOUS]
  README.md → docs/REQUIREMENTS.md
- `Fallow Is Syntactic, Not Semantic` --semantically_similar_to--> `Deterministic vs Inferred Results`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CodeGuide Layered Architecture** — docs_requirements_codeguide_core, docs_requirements_cli, docs_requirements_mcp_server, docs_requirements_desktop_application [EXTRACTED 1.00]
- **Codebase Intelligence Substrate** — docs_requirements_static_analysis_layer, docs_requirements_code_graph, docs_requirements_document_layer, docs_requirements_internal_representation, docs_requirements_adapter_pattern [EXTRACTED 1.00]
- **Pull Request Quality Gate** — workflows_ci_pipeline, workflows_fallow_audit, agents_fallow, cspell_words_dictionary, pnpm_workspace_config [INFERRED 0.85]

## Communities (65 total, 10 thin omitted)

### Community 0 - "Release & CI Workflows"
Cohesion: 0.19
Nodes (13): Single-Context Repo Layout, fallow, Fallow Exit Code Convention, Project Spelling Dictionary, pnpm Workspace Configuration, Example Apps Consume Packages By Link, Built Dependency Allowlist, E2E Browser Install Step (+5 more)

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
Cohesion: 0.17
Nodes (12): scripts, check, format, lint, prepare, release, spell-check, spell-check:sort (+4 more)

### Community 5 - "Static Analysis Principles"
Cohesion: 0.22
Nodes (9): ast-grep, Do Not Reinvent The Wheel, Graphify (tool), Incremental Analysis And Caching, Permissive Licensing Policy, No Custom Static-Analysis Engine, Oxc, Static Analysis Layer (+1 more)

### Community 6 - "CodeGuide Product Architecture"
Cohesion: 0.17
Nodes (17): Tool Adapter Pattern, AI Code Review / Verification, AI Context Efficiency, Change Impact Analysis, CodeGuide CLI, Code Graph, CodeGuide Core, codeguide doctor (+9 more)

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
Cohesion: 0.40
Nodes (3): PACKAGES, push, ROOT

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (56): openAnalysis(), currentCommit(), discoverProjects(), findRepositoryRoot(), SKIP_DIRS, toRepoPath(), detectDrift(), Drift (+48 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (48): AdapterResult, analyse(), AnalysisSession, attribute(), CALLABLE_KIND, CallSite, collectCallSites(), declarationKey() (+40 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (53): AnalysisTotals, ProjectSummary, callees(), callers(), collect(), scopeTo(), resolveSubject(), globToRegExp() (+45 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (38): analyse(), { stdout, stderr, code }, emit(), messageOf(), run, ambiguityNote(), AnalyseEnvelope, annotate() (+30 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (27): 10. Persistent documentation, 11. Documentation validation, 12. Documentation impact analysis, 13. AI coding agent integration, 14. AI implementation planning, 15. Existing-pattern discovery, 16. Code review / AI verification, 17. Change impact analysis (+19 more)

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
Cohesion: 0.21
Nodes (15): Command, failed(), isOperation(), OPERATIONS, OPTIONS, parse(), ParsedArgs, parseOptions() (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (14): Changesets Versioning, codedocs Agent Instructions, GitHub Issue Tracker Convention, GitHub Default Label Distinction, Canonical Triage Labels, CLAUDE.md Entry Point, Minimum Release Age Policy, Bot PAT Requirement (+6 more)

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
Cohesion: 0.31
Nodes (5): bootTotal, checkout(), charge(), Gateway, StripeGateway

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (8): Agent skills, codedocs, Comments, Domain docs, Graph Outputs Are Derived Artifacts, graphify, Issue tracker, Triage labels

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
Cohesion: 0.29
Nodes (7): 32. Initial MVP, Phase 1 — Analysis, Phase 2 — CLI, Phase 3 — Documentation, Phase 4 — AI, Phase 5 — AI coding assistance, Phase 6 — Desktop

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (6): AI-Provider Agnostic, Codebase Intelligence Layer, CodeGuide, Local First, Privacy: Source Code Stays Local, Code Docs

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
Cohesion: 0.33
Nodes (6): 3.1 Do not reinvent the wheel, 3.2 Local first, 3.3 Files are the source of truth, 3.4 AI-provider agnostic, 3.5 Evidence over speculation, 3. Product principles

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, include

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (5): 6. Static analysis, Project information, Relationships, Repository structure, Symbols

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): Consequences, Considered Options, Preconditions lower fidelity; honesty is evidence, not a score

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (4): 1.1 Product vision, 1. Introduction, 2. Core proposition, CodeGuide — Product Requirements Document

### Community 55 - "Community 55"
Cohesion: 0.67
Nodes (3): 27. Reliability, Deterministic results, Inferred results

### Community 56 - "Community 56"
Cohesion: 0.67
Nodes (3): 31. Pricing, CodeGuide CLI, CodeGuide Desktop

### Community 64 - "Community 64"
Cohesion: 0.60
Nodes (4): countdown(), ping(), pong(), twice()

## Ambiguous Edges - Review These
- `Code Docs` → `CodeGuide`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Release Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/release.yaml · relation: conceptually_related_to
- `Renovate Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/renovate.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **405 isolated node(s):** `$schema`, `baseBranch`, `access`, `format`, `changelog` (+400 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Code Docs` and `CodeGuide`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Release Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Renovate Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `SymbolNode` connect `Community 20` to `Community 19`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `FilePath` connect `Community 20` to `Community 19`, `Community 21`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `CallEdge` connect `Community 20` to `Community 19`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `$schema`, `baseBranch`, `access` to the rest of the system?**
  _418 weakly-connected nodes found - possible documentation gaps or missing edges._