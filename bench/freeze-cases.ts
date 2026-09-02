/**
 * Writes `bench/cases/*.json` from GitHub, once, so a benchmark run never
 * depends on the network or on an issue being edited later.
 *
 * Run with `node bench/freeze-cases.ts`. Needs an authenticated `gh`.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BenchCase, CaseShape } from './types.ts'

/**
 * The case set, hand-picked and hand-verified. For every entry: the issue has a
 * merged fix on `main`, and the tree the case runs against is the commit under
 * that fix, which is where the bug still is.
 *
 * The base commit is not written here. It is read from GitHub as the fix's
 * parent, because a hash typed twice is a hash that can disagree with itself.
 *
 * `truth` lists only non-test source files, because a patch is scored on the
 * source it changed, and a run is told not to write tests.
 */
const seeds: Array<Omit<BenchCase, 'title' | 'body' | 'issueUrl' | 'base'>> = [
  {
    id: '333230',
    issue: 333230,
    shape: 'file-named',
    fix: {
      commit: '0f7b8aef913e61b9e39b80929695d214acdda2ad',
      url: 'https://github.com/microsoft/vscode/commit/0f7b8aef913e61b9e39b80929695d214acdda2ad',
      landedAt: '2026-08-31T22:47:13Z',
    },
    truth: {
      files: ['src/vs/base/browser/ui/list/listView.ts'],
      symbols: ['getVisibleRange'],
    },
    difficulty: {
      level: 1,
      why: "Level 1. One file, one project, and the report names it on eight of the stack's frames. The cause is `getVisibleRange`, which appears on no frame, but it sits in the same file one data-flow hop from `probeDynamicHeights`: it produces the inverted range the thrower consumes. Nothing has to be crossed, and no lifetime has to be understood.",
    },
    notes:
      'The control. A stack trace names listView.ts on eight frames, so both arms should find the file cheaply. The fix is in getVisibleRange, which appears on no frame — it produces the inverted range that probeDynamicHeights later throws on. Tests whether codedocs buys anything when the file is already given.',
  },
  {
    id: '332885',
    issue: 332885,
    shape: 'symbol-named',
    fix: {
      commit: '3327a406b89e038f51f80c598f249dfe81229217',
      url: 'https://github.com/microsoft/vscode/commit/3327a406b89e038f51f80c598f249dfe81229217',
      landedAt: '2026-08-31T00:00:00Z',
    },
    truth: {
      files: [
        'src/vs/platform/agentHost/node/agentService.ts',
        'src/vs/platform/agentHost/node/copilot/copilotAgent.ts',
      ],
      symbols: [
        'restoreSession',
        '_doRestoreSession',
        '_readDefaultChatProviderData',
        'getChatMetadata',
        '_doResumeSession',
      ],
    },
    difficulty: {
      level: 3,
      why: 'Level 3. The answer spans two files in different layers — the agent host service and the Copilot provider behind it — and the call between them runs through the provider interface rather than by name. The reader has to hold both ends of a hang at once: metadata is requested in one layer and never resolved in the other. This is the edge a text search cannot see.',
    },
    notes:
      'A hang, reported with log lines rather than a stack: "restore: reading provider metadata" arrives and "restore: provider metadata resolved" never does. The symbols are named, the files are not, and the answer spans two files in different layers. The case where a call graph should pay.',
  },
  {
    id: '331452',
    issue: 331452,
    shape: 'symptom-only',
    fix: {
      commit: 'c89822681aa2b6dd95f6ee4e329fed7dcc23d333',
      url: 'https://github.com/microsoft/vscode/commit/c89822681aa2b6dd95f6ee4e329fed7dcc23d333',
      landedAt: '2026-08-25T00:00:00Z',
    },
    truth: {
      files: ['src/vs/platform/agentHost/node/agentService.ts'],
      symbols: [
        '_writeAgentMergeNotice',
        '_withLiveSessionMetadata',
        'listSessions',
      ],
    },
    difficulty: {
      level: 4,
      why: 'Level 4. Nothing in the report is an identifier, and the cause is not a place: it is what the update path does when the agent catalog is unavailable, which it accepted as success and wrote back as an empty registry. Answering means reasoning about the states a window passes through across an update — ownership of the session registry, and when it is rewritten — not about which function calls which.',
    },
    notes:
      'Sessions vanish from a window after an update. The report is careful and detailed but names no code at all: the reader has to get from "the registry lost entries" to the migration path that accepted an unavailable catalog as success.',
  },
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
]

/** Strips the issue-template HTML comments. They are identical across reports and carry no signal. */
function stripTemplateComments(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type GhIssue = { title: string; body: string | null; url: string }

/** Only the parent list is read: it is what says which tree the bug is still in. */
type GhCommit = { parents: Array<{ sha: string }> }

/**
 * The commit a case is run against: the one immediately before its fix.
 *
 * Taken from GitHub rather than from the local clone, which is shallow and
 * normally holds neither commit until the harness fetches them.
 */
function baseOf(fixCommit: string): BenchCase['base'] {
  const raw = execFileSync(
    'gh',
    ['api', `repos/microsoft/vscode/commits/${fixCommit}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const commit = JSON.parse(raw) as GhCommit
  const parent = commit.parents[0]?.sha
  if (!parent) throw new Error(`${fixCommit} has no parent to run against`)
  return {
    commit: parent,
    url: `https://github.com/microsoft/vscode/commit/${parent}`,
  }
}

/** Fetches every seeded issue and writes one frozen case file each. */
export function freeze(): void {
  for (const seed of seeds) {
    const raw = execFileSync(
      'gh',
      [
        'issue',
        'view',
        String(seed.issue),
        '--repo',
        'microsoft/vscode',
        '--json',
        'title,body,url',
      ],
      { encoding: 'utf8' },
    )
    const issue = JSON.parse(raw) as GhIssue
    const bench: BenchCase = {
      ...seed,
      base: baseOf(seed.fix.commit),
      shape: seed.shape satisfies CaseShape,
      title: issue.title,
      issueUrl: issue.url,
      body: stripTemplateComments(issue.body ?? ''),
    }
    const path = join(import.meta.dirname, 'cases', `${seed.id}.json`)
    writeFileSync(path, `${JSON.stringify(bench, null, '\t')}\n`, 'utf8')
    console.log(`froze ${seed.id}  ${bench.title}`)
  }
}

freeze()
