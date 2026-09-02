/**
 * Finding documents: a repository-wide scan for the marker.
 *
 * ADR 0005 rests the whole scheme on this being cheap, and it is: **46 ms over
 * cal.com's 380 Markdown files**, warm. The ADR's own figure was 9 ms for a scan
 * that only looked for the marker; this one reads each file once and parses the
 * ones that carry it, which is 5x the number and still nowhere near a cost that
 * would justify configuration or a cache. Not `docs/**`: cal.com has
 * **zero** Markdown under `docs/` and 55 READMEs beside the code they describe,
 * alongside changelogs and licences that must never be checked. Writing a claim
 * is how a file opts in, and a configured glob would make every user write
 * configuration before they could write their first document.
 *
 * The walk skips what the drift walk skips, for the same reason: `node_modules`
 * holds more Markdown than the repository does, and none of it is this
 * repository's to report on.
 */

import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

import type { Config } from '../config/index.ts'
import { toRepoPath } from '../discovery.ts'
import type { FilePath } from '../model.ts'
import { MARKER, parseDocument, type ParsedDocument } from './document.ts'

/**
 * Directories never walked.
 *
 * Kept in step with `drift.ts` deliberately rather than shared: that list is
 * about what a TypeScript project can glob, and this one is about where a
 * committed document can live. They agree today and are free to stop.
 */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.codedocs',
  '.yarn',
])

const MARKDOWN = /\.mdx?$/i

/** What one scan found, and what it cost — so the number stays a measurement. */
export interface DocumentScan {
  readonly documents: readonly ParsedDocument[]
  /** Every Markdown file read, whether or not it carried a marker. */
  readonly scanned: number
  readonly durationMs: number
}

/**
 * Every document in the repository, sorted by path.
 *
 * A file is read once and tested for the marker before it is parsed, so the cost
 * over a repository with no documents is one string search per Markdown file.
 *
 * @param config - Read for `discover.skip` alone. A directory a repository has
 * excluded from project discovery is not part of what codedocs reports on, and
 * a README inside one belongs to whoever put it there — this repository's own
 * `repos/` holds five fixture checkouts and 11,776 Markdown files between them.
 */
export function discoverDocuments(root: string, config: Config): DocumentScan {
  const started = performance.now()
  const documents: ParsedDocument[] = []
  const skip = new Set([...SKIP_DIRS, ...config.discover.skip])
  let scanned = 0

  for (const absolute of markdownFiles(root, skip)) {
    scanned += 1
    const text = read(absolute)
    if (text === null || !text.includes(MARKER)) continue
    const parsed = parseDocument(toRepoPath(root, absolute), text)
    // A marker inside a fenced block is an example rather than a claim, so a
    // file whose only marker was fenced is not a document after all.
    if (parsed.sections.some((section) => section.claims.length > 0)) {
      documents.push(parsed)
    }
  }

  documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    documents,
    scanned,
    durationMs: Math.round(performance.now() - started),
  }
}

/** Every Markdown file under `root`, depth first and in directory order. */
function* markdownFiles(
  root: string,
  skip: ReadonlySet<string>,
): Generator<string> {
  const stack = [root]
  while (stack.length > 0) {
    const directory = stack.pop()
    if (directory === undefined) continue
    for (const entry of entriesOf(directory)) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(path)
      } else if (entry.isFile() && MARKDOWN.test(entry.name)) {
        yield path
      }
    }
  }
}

/**
 * One directory's entries, or none where it cannot be read.
 *
 * A directory that cannot be read is not a document, and a scan is not the place
 * to report a permission problem about a file nobody named.
 */
function entriesOf(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

const read = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** Whether a repository-relative path exists on disk, for checking a prose link. */
export function existsAt(root: string, path: FilePath): boolean {
  try {
    return statSync(join(root, path)).isFile()
  } catch {
    return false
  }
}
