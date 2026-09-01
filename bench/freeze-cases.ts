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
 * The case set, hand-picked and hand-verified. For every entry: the fix landed
 * on `main` after the pinned vscode checkout, and the buggy code is still in
 * the working tree — checked by grepping our tree for a distinctive added line.
 *
 * `truth` lists only non-test source files, because a localization answer that
 * named the test file would be scored as a miss by any reasonable reader.
 */
const seeds: Array<Omit<BenchCase, 'title' | 'body' | 'issueUrl'>> = [
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
