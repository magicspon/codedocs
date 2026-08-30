# Graph Report - .  (2026-08-30)

## Corpus Check
- Corpus is ~8,083 words - fits in a single context window. You may not need a graph.

## Summary
- 222 nodes · 238 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 85% EXTRACTED · 14% INFERRED · 1% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.89)
- Token cost: 80,466 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `scripts` - 12 edges
3. `Fallow PR Audit Workflow` - 8 edges
4. `codedocs Agent Instructions` - 7 edges
5. `pnpm Workspace Configuration` - 7 edges
6. `CodeGuide Core` - 7 edges
7. `Static Analysis Layer` - 7 edges
8. `Code Graph` - 7 edges
9. `Release Workflow` - 6 edges
10. `Domain Docs Convention` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Knowledge Graph Workflow` --semantically_similar_to--> `Code Graph`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Fallow Static Analysis Workflow` --semantically_similar_to--> `Static Analysis Layer`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Fallow PR Audit Workflow` --semantically_similar_to--> `AI Code Review / Verification`  [INFERRED] [semantically similar]
  .github/workflows/fallow.yml → docs/REQUIREMENTS.md
- `Fallow Is Syntactic, Not Semantic` --semantically_similar_to--> `Deterministic vs Inferred Results`  [INFERRED] [semantically similar]
  AGENTS.md → docs/REQUIREMENTS.md
- `Code Docs README` --conceptually_related_to--> `CodeGuide`  [AMBIGUOUS]
  README.md → docs/REQUIREMENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CodeGuide Layered Architecture** — docs_requirements_codeguide_core, docs_requirements_cli, docs_requirements_mcp_server, docs_requirements_desktop_application [EXTRACTED 1.00]
- **Codebase Intelligence Substrate** — docs_requirements_static_analysis_layer, docs_requirements_code_graph, docs_requirements_document_layer, docs_requirements_internal_representation, docs_requirements_adapter_pattern [EXTRACTED 1.00]
- **Pull Request Quality Gate** — workflows_ci_pipeline, workflows_fallow_audit, agents_fallow, cspell_words_dictionary, pnpm_workspace_config [INFERRED 0.85]

## Communities (19 total, 3 thin omitted)

### Community 0 - "Release & CI Workflows"
Cohesion: 0.13
Nodes (21): Changesets Versioning, Fallow Static Analysis Workflow, Fallow Exit Code Convention, Project Spelling Dictionary, pnpm Workspace Configuration, Example Apps Consume Packages By Link, Minimum Release Age Policy, Built Dependency Allowlist (+13 more)

### Community 1 - "TypeScript Compiler Config"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, erasableSyntaxOnly, isolatedDeclarations, isolatedModules, lib, module, moduleResolution (+12 more)

### Community 2 - "Agent & Documentation Conventions"
Cohesion: 0.12
Nodes (20): codedocs Agent Instructions, Code Comment Conventions, Architecture Decision Records, CONTEXT.md Glossary, Domain Docs Convention, Lazy Domain Doc Creation, Single-Context Repo Layout, Fallow Is Syntactic, Not Semantic (+12 more)

### Community 3 - "Dev Tooling Dependencies"
Cohesion: 0.10
Nodes (18): config, devDependencies, @changesets/changelog-github, @changesets/cli, @commitlint/cli, @commitlint/config-conventional, @commitlint/types, husky (+10 more)

### Community 4 - "Package Scripts & Metadata"
Cohesion: 0.10
Nodes (19): engines, node, name, packageManager, private, scripts, check, format (+11 more)

### Community 5 - "Static Analysis Principles"
Cohesion: 0.12
Nodes (17): Graph Outputs Are Derived Artifacts, Graphify Knowledge Graph Workflow, AI-Provider Agnostic, ast-grep, Codebase Intelligence Layer, CodeGuide, Do Not Reinvent The Wheel, Graphify (tool) (+9 more)

### Community 6 - "CodeGuide Product Architecture"
Cohesion: 0.17
Nodes (17): Tool Adapter Pattern, AI Code Review / Verification, AI Context Efficiency, Change Impact Analysis, CodeGuide CLI, Code Graph, CodeGuide Core, codeguide doctor (+9 more)

### Community 7 - "Renovate Dependency Config"
Cohesion: 0.12
Nodes (16): commitMessageAction, commitMessagePrefix, commitMessageTopic, dependencyDashboard, description, extends, packageRules, postUpgradeTasks (+8 more)

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

## Ambiguous Edges - Review These
- `Code Docs README` → `CodeGuide`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Release Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/release.yaml · relation: conceptually_related_to
- `Renovate Workflow` → `GitHub Issue Tracker Convention`  [AMBIGUOUS]
  .github/workflows/renovate.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **124 isolated node(s):** `$schema`, `baseBranch`, `access`, `format`, `changelog` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Code Docs README` and `CodeGuide`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Release Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Renovate Workflow` and `GitHub Issue Tracker Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `devDependencies` connect `Dev Tooling Dependencies` to `Spell Check Config`, `Package Scripts & Metadata`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `codedocs Agent Instructions` connect `Agent & Documentation Conventions` to `Release & CI Workflows`, `Static Analysis Principles`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `CodeGuide Core` connect `CodeGuide Product Architecture` to `Agent & Documentation Conventions`, `Static Analysis Principles`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Fallow PR Audit Workflow` (e.g. with `CI Workflow` and `Fallow Static Analysis Workflow`) actually correct?**
  _`Fallow PR Audit Workflow` has 5 INFERRED edges - model-reasoned connections that need verification._