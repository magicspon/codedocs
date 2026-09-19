/**
 * Change history for fallow's hotspots, as seen from a past commit.
 *
 * fallow reads churn from `git log` and weighs each commit by its age *today*,
 * so an old frame would show every file cooling. Instead the history up to the
 * frame's commit is handed over as a `fallow-churn/v1` file with every
 * timestamp moved forward by the commit's age: relative ages are kept, and
 * fallow scores the file as if it were run on the day of the commit.
 */

import { execFileSync } from 'node:child_process'

/** One file touched by one commit, in fallow's churn contract. */
export interface ChurnEvent {
  readonly path: string
  /** Unix seconds. */
  readonly timestamp: number
  readonly added: number
  readonly deleted: number
  readonly author: string
}

/** The file `fallow health --churn-file` reads. */
export interface ChurnFile {
  readonly schema: 'fallow-churn/v1'
  readonly events: readonly ChurnEvent[]
}

/** fallow's default hotspot window. */
const WINDOW_SECONDS = 183 * 24 * 60 * 60

/** The `git log` format `parseLog` reads: a `%at|%ae` header, then numstat lines. */
const LOG_FORMAT = '--format=format:%at|%ae'

/**
 * Parses `git log --numstat` output into events, each moved forward by
 * `shift` seconds. Binary files show `-` for their line counts; they read as 0.
 * A path git still quotes (one holding a tab, newline or quote) is dropped:
 * fallow rejects the whole file over one path it cannot resolve.
 */
export function parseLog(text: string, shift: number): ChurnEvent[] {
  const events: ChurnEvent[] = []
  let timestamp = 0
  let author = ''
  for (const line of text.split('\n')) {
    const stat = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (stat) {
      if (stat[3]!.startsWith('"')) continue
      events.push({
        path: stat[3]!,
        timestamp: timestamp + shift,
        added: Number(stat[1]) || 0,
        deleted: Number(stat[2]) || 0,
        author,
      })
      continue
    }
    const header = /^(\d+)\|(.*)$/.exec(line)
    if (header) {
      timestamp = Number(header[1])
      author = header[2]!
    }
  }
  return events
}

/**
 * The churn fallow would have seen at `HEAD` of the checkout at `dir`, if it
 * had been run then. `now` is the wall clock fallow will measure ages from.
 */
export function churnAt(
  dir: string,
  now: number = Date.now() / 1000,
): ChurnFile {
  const git = (...args: string[]): string =>
    // Unquoted so a non-ASCII name reaches fallow as the path it is.
    execFileSync('git', ['-C', dir, '-c', 'core.quotePath=false', ...args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
    })
  const head = Number(git('log', '-1', '--format=%ct').trim())
  // The same flags fallow passes to git itself, so the two readings agree.
  const log = git(
    'log',
    '--numstat',
    '--no-merges',
    '--no-renames',
    '--use-mailmap',
    `--since=@${head - WINDOW_SECONDS}`,
    LOG_FORMAT,
  )
  return {
    schema: 'fallow-churn/v1',
    events: parseLog(log, Math.max(0, Math.round(now - head))),
  }
}
