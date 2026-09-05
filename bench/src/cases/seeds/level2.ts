/**
 * Level 2 — one subsystem, no address.
 *
 * The answer is still one file in one project, but nothing in the report names
 * it. The agent has to get there from a symbol, a log line, a setting or a
 * product noun, and then work out which part of the file the behaviour lives
 * in. Everything it needs sits inside one subsystem.
 */

import type { Seed } from './index.ts'

export const level2: Seed[] = [
  {
    id: '331102',
    issue: 331102,
    shape: 'symbol-named',
    fix: {
      commit: 'ebaaae902157f381f02fc8f9cdf73cd571c7bb96',
      url: 'https://github.com/microsoft/vscode/commit/ebaaae902157f381f02fc8f9cdf73cd571c7bb96',
      landedAt: '2026-08-22T00:00:00Z',
    },
    truth: {
      files: [
        'src/vs/sessions/contrib/providers/remoteAgentHost/browser/tunnelAgentHost.contribution.ts',
      ],
      symbols: [
        '_resumeReconnects',
        '_probeHostOnline',
        '_handleSessionsChange',
        '_finishConnectAttempt',
      ],
    },
    difficulty: {
      level: 2,
      why: 'Level 2. The report names one private method and no file, so the search starts with a symbol lookup that settles the file on its own. What is left is local: which callers inside the same contribution reach `_resumeReconnects` when a window regains focus. One file, one project, no interface in between.',
    },
    notes:
      'The issue names one private method, `_resumeReconnects`, and nothing else. A single symbol lookup should settle the file. The remaining work — which callers reach it on window focus — is what separates the arms.',
  },
  {
    id: '333085',
    issue: 333085,
    shape: 'symptom-only',
    fix: {
      commit: '8853be931dfb182c2497ecd99768a9442e4b7019',
      url: 'https://github.com/microsoft/vscode/commit/8853be931dfb182c2497ecd99768a9442e4b7019',
      landedAt: '2026-08-31T00:00:00Z',
    },
    truth: {
      files: ['src/vs/sessions/contrib/automations/browser/automationTools.ts'],
      symbols: ['getToolData', 'ConfigureAutomationTool'],
    },
    difficulty: {
      level: 2,
      why: 'Level 2. One file, one project, but nothing in the report is an identifier — the only anchor is a product noun, so the agent has to guess at vocabulary before it can look anything up. Once the tool is found the answer is a description string inside it, with no path to follow. Hard at the start of the search rather than in the middle of it.',
    },
    notes:
      'Behaviour only: an agent created a scheduled automation nobody asked for. Nothing in the text is a code identifier, and the fix is a tool-description string. The case where grep on a product noun may well beat a call graph — worth keeping for exactly that reason.',
  },
  {
    id: '327194',
    issue: 327194,
    shape: 'symbol-named',
    fix: {
      commit: '8d032eaa87d7f59484f6d6128dc84853849399dd',
      url: 'https://github.com/microsoft/vscode/commit/8d032eaa87d7f59484f6d6128dc84853849399dd',
      landedAt: '2026-09-01T12:56:21Z',
    },
    truth: {
      files: [
        'src/vs/platform/extensionManagement/common/extensionManagement.ts',
      ],
      symbols: [
        'EXTENSION_IDENTIFIER_PATTERN',
        'EXTENSION_PUBLISHER_IDENTIFIER_PATTERN',
      ],
    },
    difficulty: {
      level: 2,
      why: 'Level 2. One file, one project, and the anchor is a setting name rather than a symbol: `extensions.allowed` leads to the configuration contribution that declares its schema. From there the work is local and textual — two `patternProperties` regexes where the publisher-only one is unanchored, so it also matches the tail of a full identifier and wins. No layer is crossed and no call is followed.',
    },
    notes:
      'A third level 2 anchored on neither a symbol nor a product noun but a settings key, which is the shape a call graph has least to say about — the answer is a JSON-schema declaration nothing calls. A genuine external user report, and the one case in the pool whose fix is a regex.',
  },
]
