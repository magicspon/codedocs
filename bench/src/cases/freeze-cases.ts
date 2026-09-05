/**
 * Writes `bench/prospects/*.json` from GitHub, once, so a benchmark run never
 * depends on the network or on an issue being edited later.
 *
 * The freezer writes the whole pool. Which of those prospects is actually run
 * is `active.ts`, and promoting one is a deliberate act with a cost attached —
 * not a side effect of researching a case.
 *
 * Run with `node bench/freeze-cases.ts`. Needs an authenticated `gh`.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROSPECTS } from '../core/paths.ts'
import { seeds } from './seeds/index.ts'
import type { BenchCase, CaseShape } from '../core/types.ts'

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
    const path = join(PROSPECTS, `${seed.id}.json`)
    writeFileSync(path, `${JSON.stringify(bench, null, '\t')}\n`, 'utf8')
    console.log(`froze ${seed.id}  ${bench.title}`)
  }
}

freeze()
