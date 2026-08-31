# CodeGuide — Product Requirements Document

## 1. Introduction

### 1.1 Product vision

**AI writes the code. CodeGuide helps AI and humans understand it.**

AI coding agents can generate software extremely quickly. The bottleneck is increasingly understanding the existing codebase: its architecture, dependencies, patterns, conventions and relationships.

CodeGuide is a local-first developer tool that builds a structured understanding of a TypeScript codebase using existing static-analysis and code-intelligence tools.

It exposes that understanding to both developers and AI coding agents.

CodeGuide should **not reinvent static analysis**. Where high-quality existing tools exist, CodeGuide should integrate and orchestrate them rather than implementing its own parser, compiler analysis or language server.

The product should use established tooling such as Oxc, TypeScript, ast-grep, Graphify and other appropriate Rust/TypeScript-based tools where they provide the required capabilities.

The goal is to create a persistent, queryable **codebase intelligence layer**.

---

## 2. Core proposition

CodeGuide should allow an AI coding agent to answer questions such as:

- Where does this functionality live?
- How does this feature work?
- What calls this function?
- What does this function depend on?
- Where are similar implementations?
- What architectural patterns does this codebase use?
- Which files should I modify to implement this feature?
- What existing code should I use as an example?
- What documentation describes this behaviour?
- What documentation is affected by this change?
- Does this proposed change fit the existing architecture?
- Did this code change introduce unexpected dependencies?

The AI agent remains responsible for generating code.

CodeGuide provides **structured evidence and context** that helps the agent generate better code.

---

# 3. Product principles

### 3.1 Do not reinvent the wheel

CodeGuide must prefer existing, mature tooling over custom implementations.

Potential building blocks include:

- Oxc
- TypeScript compiler APIs
- ast-grep
- Graphify
- Git
- existing language tooling
- existing dependency-analysis tools
- existing test/coverage tooling

CodeGuide should primarily provide orchestration, persistence, relationships, documentation, querying and AI integration.

### 3.2 Local first

The core product should run locally.

The user's source code should not need to be uploaded to a CodeGuide server.

The codebase intelligence database/index should live locally.

### 3.3 Files are the source of truth

Generated documentation and walkthroughs should be stored as normal files in the repository.

Prefer Markdown and other human-readable formats.

For example:

```text
docs/
  architecture/
    authentication.md
    payments.md
  walkthroughs/
    login.md
    checkout.md
```

The files should work with:

- Git
- GitHub
- pull requests
- code review
- existing editors
- AI coding agents

CodeGuide should not require users to store their documentation in a proprietary hosted database.

### 3.4 AI-provider agnostic

CodeGuide must not depend on a specific LLM provider.

It should work with AI coding tools including, where supported:

- Claude Code
- Codex
- Cursor
- other MCP-compatible agents

LLM calls should be performed by the user's chosen AI tooling where practical.

CodeGuide's core static analysis must not require an LLM.

### 3.5 Evidence over speculation

CodeGuide-generated explanations should be grounded in the actual source code and static-analysis results.

Where possible, explanations should include references to:

- files
- symbols
- relationships
- line ranges
- dependencies
- callers
- callees
- relevant documentation

CodeGuide should avoid presenting inferred information as fact.

---

# 4. Target users

Primary users:

- TypeScript developers
- frontend developers
- backend developers
- full-stack developers
- developers using AI coding agents
- agencies maintaining multiple TypeScript codebases
- teams working on large or unfamiliar repositories

The initial product should focus on individual developers rather than enterprise administration.

---

# 5. Core architecture

CodeGuide should be divided into reusable layers.

```text
                    CodeGuide
                       │
             ┌─────────┴─────────┐
             │                   │
           CLI                  MCP
             │                   │
             └─────────┬─────────┘
                       │
                 CodeGuide Core
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
      Static       Code Graph    Documents
      Analysis
          │            │            │
          └────────────┼────────────┘
                       │
                  Git / Changes
                       │
                       ▼
              Codebase Intelligence
```

The core should be reusable by:

- CLI
- MCP server
- desktop application

The desktop application should not implement a second analysis engine.

---

# 6. Static analysis

CodeGuide must build its understanding using existing tools.

The system should identify, where supported:

### Repository structure

- applications
- packages
- libraries
- source directories
- test directories
- configuration
- generated code
- monorepo boundaries

### Symbols

- functions
- classes
- interfaces
- types
- variables
- constants
- enums
- methods
- components
- hooks

### Relationships

- imports
- exports
- calls
- inheritance
- implementations
- type references
- symbol references
- dependencies
- package relationships

### Project information

- package.json
- workspace configuration
- TypeScript configuration
- build configuration
- test configuration
- lint configuration

CodeGuide should consume existing analysis output wherever possible.

---

# 7. Code graph

CodeGuide should maintain a graph representing the important relationships within the codebase.

Graphify or another suitable existing graph-analysis tool should be used where appropriate rather than implementing an equivalent graph-analysis engine.

The graph should make it possible to answer queries such as:

```text
Who calls X?

What does X call?

What depends on X?

What imports X?

What implementations exist for interface X?

What code is reachable from X?

What changed relationships after this Git diff?
```

The graph should be queryable by the MCP server.

---

# 8. Codebase exploration

CodeGuide must support structured exploration of a codebase.

Example CLI commands:

```bash
codeguide analyse
codeguide symbol AuthService
codeguide callers AuthService.login
codeguide callees AuthService.login
codeguide references User
codeguide trace "POST /checkout"
```

The exact command names may change during implementation.

The important requirement is that developers and AI agents can explore the codebase using structured queries rather than repeatedly searching raw source files.

---

# 9. Explanations

CodeGuide should generate explanations of how code works.

Examples:

```bash
codeguide explain AuthService.login
```

```bash
codeguide walkthrough "checkout"
```

```bash
codeguide walkthrough "How does authentication work?"
```

Explanations should primarily answer:

> **How does this work?**

rather than:

> **Why did the original developer make this decision?**

Unless the repository contains evidence explaining the rationale, CodeGuide should not invent architectural motivations.

Explanations should be grounded in:

- static-analysis results
- source code
- code graph
- existing documentation
- configuration
- Git history where appropriate

---

# 10. Persistent documentation

Users should be able to save explanations and walkthroughs to disk.

Example:

```bash
codeguide docs generate "How does checkout work?"
```

produces:

```text
docs/walkthroughs/checkout.md
```

Documents should contain enough metadata for CodeGuide to understand what code they describe.

Possible metadata:

```yaml
---
title: Checkout flow
codeguide:
  symbols:
    - CheckoutService
    - PaymentService
  files:
    - src/checkout/**
---
```

The exact format should be designed during implementation.

The metadata must remain human-readable and Git-friendly.

---

# 11. Documentation validation

CodeGuide must be able to determine whether documentation remains true and up to date.

Example:

```bash
codeguide docs check
```

The validator should compare the claims/relationships represented by documentation against the current codebase.

Results should distinguish between:

- verified
- potentially stale
- contradicted
- unable to verify

Example:

```text
✓ docs/auth/login.md
  Verified against current source

⚠ docs/checkout.md
  CheckoutService dependencies have changed

✗ docs/payments.md
  Documentation references PaymentGateway,
  which no longer exists
```

Validation should use static analysis as the primary evidence.

LLMs may assist with semantic comparison where required, but deterministic checks should be preferred.

---

# 12. Documentation impact analysis

CodeGuide must identify documentation affected by a code change.

Example:

```bash
codeguide docs affected
```

or:

```bash
codeguide docs affected --base main
```

Example output:

```text
3 documents affected

⚠ docs/auth/login.md
  AuthService.login changed

⚠ docs/architecture/authentication.md
  Authentication dependency graph changed

⚠ docs/walkthroughs/login.md
  Referenced call path changed

✓ docs/orders.md
  No relevant changes detected
```

Impact analysis should use relationships between:

- source files
- symbols
- graph nodes
- documentation
- documented claims

---

# 13. AI coding agent integration

This is a primary product requirement.

CodeGuide must expose its codebase intelligence through MCP.

The MCP server should allow an AI agent to query structured information about the repository.

Potential tools include:

```text
codeguide_search
codeguide_symbol
codeguide_callers
codeguide_callees
codeguide_references
codeguide_trace
codeguide_examples
codeguide_docs
codeguide_docs_affected
codeguide_docs_check
codeguide_plan
codeguide_review
```

The exact tool API should be determined during implementation.

The tools should return concise, structured results rather than unnecessarily large amounts of source code.

---

# 14. AI implementation planning

CodeGuide should help an AI agent plan changes before writing code.

Example:

```text
User:

Add Apple Pay support.
```

The AI should be able to query CodeGuide for:

- relevant abstractions
- existing implementations
- similar features
- dependency relationships
- configuration
- tests
- documentation
- likely affected files

CodeGuide may expose a planning operation such as:

```text
codeguide_plan
```

Example result:

```text
Existing abstraction:
PaymentProvider

Existing implementations:
StripeProvider
PayPalProvider

Primary integration point:
PaymentService

Registration:
src/payments/providers.ts

Tests:
tests/payments/

Recommended implementation:
1. Implement PaymentProvider
2. Register provider
3. Add configuration
4. Add unit tests
5. Add integration tests
```

The AI remains responsible for the final implementation.

---

# 15. Existing-pattern discovery

CodeGuide should help AI agents find examples of how the existing codebase solves similar problems.

For example:

```text
Find implementations of API endpoints
```

could return:

```text
src/orders/create.ts
src/users/create.ts
src/payments/create.ts
```

along with the relevant structural relationships.

This should help AI agents follow established repository patterns rather than inventing new architectures.

---

# 16. Code review / AI verification

CodeGuide should be able to analyse changes made by an AI agent.

Example:

```bash
codeguide review
```

The review should consider:

- Git diff
- dependency graph
- architecture
- existing patterns
- symbol relationships
- documentation
- tests
- project configuration

Potential output:

```text
✓ No broken imports

✓ Existing interfaces respected

✓ Dependency direction maintained

⚠ Potential architectural violation

CheckoutController directly imports OrderRepository.

Existing architecture:
Controller → Service → Repository
```

The MCP equivalent should allow an AI agent to invoke the same review capability.

The goal is to allow:

```text
AI writes code
        ↓
CodeGuide reviews code
        ↓
AI receives findings
        ↓
AI fixes code
```

---

# 17. Change impact analysis

CodeGuide should integrate with Git.

It should be able to determine:

- changed files
- changed symbols
- removed symbols
- changed relationships
- affected tests
- affected documentation
- potentially affected consumers

Example:

```bash
codeguide impact
```

Output:

```text
Changed:
  AuthService.login

Affected:
  LoginController
  SessionService
  Login tests

Documentation:
  docs/auth/login.md
  docs/architecture/auth.md
```

---

# 18. AI context efficiency

CodeGuide should optimise for **useful context rather than maximum context**.

The system should not simply dump the repository into an LLM.

Instead it should provide targeted context:

```text
User request
     ↓
CodeGuide query
     ↓
Relevant graph nodes
     ↓
Relevant source
     ↓
Relevant examples
     ↓
Relevant documentation
     ↓
Compact context
     ↓
AI agent
```

This should reduce unnecessary repository exploration and repeated discovery.

---

# 19. Documentation as persistent AI memory

Documentation stored in the repository should be usable by AI agents.

An AI agent should be able to query:

```text
What does the repository documentation say about authentication?
```

and receive relevant documents alongside current source-code evidence.

However, stale documentation must not automatically be treated as truth.

CodeGuide should expose documentation state:

```text
verified
stale
contradicted
unknown
```

This allows AI agents to distinguish persistent knowledge from potentially outdated information.

---

# 20. CLI

The initial product should be CLI-first.

Potential command structure:

```bash
codeguide init
codeguide analyse
codeguide explain
codeguide walkthrough
codeguide symbol
codeguide trace
codeguide search
codeguide docs generate
codeguide docs check
codeguide docs affected
codeguide impact
codeguide review
codeguide plan
codeguide mcp
codeguide doctor
```

Commands should be designed around developer workflows rather than exposing internal implementation details.

---

# 21. MCP server

The MCP server should be installable locally.

Example:

```bash
codeguide mcp
```

It should expose the CodeGuide engine to compatible AI agents.

The MCP server should:

- operate locally
- access the current repository
- query the local code graph
- retrieve relevant documentation
- analyse changes
- provide structured results
- avoid unnecessary context expansion

---

# 22. Desktop application

The desktop application is an optional paid add-on.

It should be built using Tauri.

The desktop application should reuse the same CodeGuide core used by the CLI and MCP server.

It should provide visual interfaces for:

- codebase exploration
- dependency graphs
- documentation
- walkthroughs
- change impact
- documentation health
- AI context
- architecture exploration

The desktop application must not duplicate static-analysis logic.

Potential interface:

```text
Repository
├── Overview
├── Architecture
├── Graph
├── Symbols
├── Documentation
├── Walkthroughs
└── Changes
```

---

# 23. Technology requirements

The implementation should be primarily TypeScript.

Potential technologies:

- TypeScript
- Node.js
- pnpm
- Tauri
- Vite
- existing Rust-based JavaScript tooling
- Oxc
- TypeScript compiler APIs
- ast-grep
- Graphify
- Git
- MCP

Use Rust-based tooling where it provides high-performance parsing or analysis rather than reimplementing equivalent functionality in TypeScript.

The exact dependency selection should be validated during implementation.

---

# 24. No custom static-analysis engine

This is a hard requirement.

CodeGuide must not implement its own TypeScript parser or attempt to reproduce capabilities already provided by mature tooling.

Before implementing a new analysis capability, determine whether an existing tool can provide it.

The preferred approach is:

```text
Existing tool
     ↓
Adapter
     ↓
CodeGuide internal model
```

rather than:

```text
CodeGuide
     ↓
Custom parser
     ↓
Custom analyser
     ↓
Custom graph
```

---

# 25. Internal representation

CodeGuide should provide a normalised internal representation where necessary so different analysis tools can be combined.

For example:

```text
Repository
  ├── Package
  ├── File
  ├── Symbol
  ├── Relationship
  ├── Document
  └── Change
```

Adapters should translate tool-specific output into this representation.

The internal model should avoid leaking a particular analysis tool's API throughout the application.

---

# 26. Performance

CodeGuide should be usable on large TypeScript repositories.

Requirements:

- incremental analysis where practical
- cache analysis results
- avoid rebuilding the entire graph for every query
- analyse only changed files when possible
- support monorepos
- avoid sending large amounts of unnecessary context to LLMs

The initial implementation should prioritise correctness over premature optimisation.

---

# 27. Reliability

CodeGuide must clearly distinguish:

### Deterministic results

Examples:

- imports
- symbol references
- callers
- callees
- Git changes
- file existence
- dependency relationships

### Inferred results

Examples:

- architectural intent
- semantic similarity
- likely purpose
- inferred documentation meaning

Inferred results should be clearly represented as such.

---

# 28. Privacy

The core product should operate locally.

Source code should not be sent to CodeGuide infrastructure.

If an LLM is used, the user should be able to understand which provider receives the relevant context.

The product should not require CodeGuide to receive source code.

---

# 29. Support model

CodeGuide is intended to be a low-cost developer utility.

The core product should be designed for self-service support.

A diagnostic command should be provided:

```bash
codeguide doctor
```

A bug-report command should generate an AI-readable diagnostic report:

```bash
codeguide report-bug
```

The report should contain useful diagnostic information such as:

- CodeGuide version
- OS
- Node version
- package manager
- relevant dependency versions
- configuration
- analysis results
- errors
- stack traces
- reproduction command

Users should be able to give the report directly to an AI coding agent.

If the issue cannot be resolved, the report can be attached to a GitHub issue.

---

# 30. Licensing and dependencies

The project should favour permissively licensed dependencies suitable for commercial distribution.

Before adopting any dependency, verify:

- license
- redistribution requirements
- commercial-use restrictions
- attribution requirements
- transitive dependency licenses

Graphify and other third-party analysis tools should be consumed according to their respective licenses.

CodeGuide's own implementation can remain proprietary even when it uses permissively licensed open-source dependencies.

---

# 31. Pricing

Initial commercial model:

### CodeGuide CLI

**£9 one-time purchase**

No subscription.

The CLI should provide the core CodeGuide functionality.

### CodeGuide Desktop

**£20 one-time add-on**

The desktop application provides a visual interface on top of the same CodeGuide engine.

Potential combined purchase:

**£29 one-time.**

The product should avoid recurring infrastructure costs where possible.

The user should generally provide their own AI/LLM subscription or API access.

---

# 32. Initial MVP

The MVP should focus on proving the core concept.

### Phase 1 — Analysis

- repository discovery
- TypeScript analysis
- symbol extraction
- relationship extraction
- graph integration
- persistent local index

### Phase 2 — CLI

Implement:

```bash
codeguide init
codeguide analyse
codeguide symbol
codeguide callers
codeguide callees
codeguide trace
```

### Phase 3 — Documentation

Implement:

```bash
codeguide explain
codeguide walkthrough
codeguide docs generate
codeguide docs check
codeguide docs affected
```

### Phase 4 — AI

Implement MCP integration:

```bash
codeguide mcp
```

Expose structured codebase queries.

### Phase 5 — AI coding assistance

Add:

```text
examples
planning
change impact
code review
```

### Phase 6 — Desktop

Build the Tauri application once the underlying engine and workflows are proven.

---

# 33. Success criteria

The MVP should demonstrate that an AI coding agent can perform better with CodeGuide than without it.

The key experiment is:

> Give an AI agent a non-trivial TypeScript repository and ask it to implement a feature.

Compare:

```text
AI without CodeGuide
```

against:

```text
AI + CodeGuide MCP
```

Measure:

- time to implementation
- number of files unnecessarily inspected
- token usage where measurable
- incorrect architectural assumptions
- duplicate implementations
- test failures
- required corrections
- final code quality

The primary success criterion is:

> **CodeGuide helps an AI agent understand an unfamiliar codebase and make changes that better fit the existing architecture.**

Documentation generation is valuable, but it is not the ultimate product goal.

---

# 34. Long-term vision

CodeGuide should become a **codebase intelligence layer for AI-assisted software development**.

The long-term workflow should look like:

```text
                   User request
                        │
                        ▼
                  AI coding agent
                        │
                        ▼
                    CodeGuide
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   Code graph      Documentation     Existing
                                      patterns
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                 Implementation plan
                        │
                        ▼
                   AI writes code
                        │
                        ▼
                 CodeGuide reviews
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
          Acceptable          Problems
              │                   │
              │                   ▼
              │              AI fixes
              │                   │
              └─────────┬─────────┘
                        ▼
                   Git commit
                        │
                        ▼
                 Impact analysis
                        │
                        ▼
              Documentation updates
```

The ultimate product proposition is:

> **AI can write software. CodeGuide gives it the understanding required to write software that belongs in your codebase.**
