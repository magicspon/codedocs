/**
 * A timeline: the repository analysed at a spread of past commits.
 *
 * The index holds one moment, so history has to be re-analysed. Each commit is
 * checked out into a throwaway worktree outside the repo — inside it, the next
 * `codedocs analyse` of the repo would discover it as more projects — with the
 * repo's `node_modules` linked in so old commits still analyse at `typed`
 * fidelity. With fallow on the PATH, each commit also gets its health readings,
 * scored as of that commit. The analysis and the readings are cached by sha
 * separately, so adding fallow to an old timeline does not re-analyse it.
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import type { Atlas, Commit, Timeline } from '../src/lib/atlas.ts'
import { withHealth } from './fallow-health.ts'
import { readAtlas } from './read-index.ts'
import { readFallow, type FallowReading } from './read-fallow.ts'
import { mirror, nodeModules } from './worktree.ts'

/** What one timeline is built from. */
export interface TimelineOptions {
  /** The repository root. */
  readonly repo: string
  /** The dataset name the viewer lists. */
  readonly name: string
  /** How many commits, at least 2; the last is always HEAD. */
  readonly frames: number
  /** Whether to run fallow over each commit. */
  readonly fallow: boolean
  /** Where frames are kept by sha between runs. */
  readonly cacheDir: string
  /** Writes `dir/.codedocs/index.db`; throws when the commit will not analyse. */
  readonly analyse: (dir: string) => void
  /** Progress, one line at a time. */
  readonly log: (line: string) => void
}

/** A throwaway worktree, checked out on first use so a fully cached frame never touches git. */
interface LazyTree {
  readonly dir: () => string
  readonly close: () => void
}

/** Everything one run shares across its frames. */
interface Run extends TimelineOptions {
  readonly git: (...args: string[]) => string
  readonly modules: readonly string[]
}

/** `frames` commits spread evenly along first-parent history, always ending at HEAD. */
function pickCommits(run: Run): Commit[] {
  const lines = run
    .git('log', '--first-parent', '--reverse', '--format=%H%x09%cI%x09%s')
    .split('\n')
  const count = Math.max(2, run.frames)
  const picks = new Set<number>()
  for (let k = 0; k < count; k++)
    picks.add(Math.round((k / (count - 1)) * (lines.length - 1)))
  return [...picks].map((i) => {
    const [sha = '', date = '', subject = ''] = lines[i]!.split('\t')
    return { sha, date, subject }
  })
}

function lazyTree(run: Run, sha: string): LazyTree {
  let dir: string | undefined
  return {
    dir: () => {
      if (dir) return dir
      dir = join(mkdtempSync(join(tmpdir(), 'code-art-')), 'tree')
      run.git('worktree', 'add', '--quiet', '--detach', '--force', dir, sha)
      return dir
    },
    close: () => {
      if (dir) run.git('worktree', 'remove', '--force', dir)
    },
  }
}

/** Analyses the checkout at `dir` and reads it back. */
function analyse(run: Run, dir: string): Atlas {
  for (const source of run.modules) {
    const target = join(dir, relative(run.repo, source))
    if (existsSync(resolve(target, '..')))
      mirror(source, target, { repo: run.repo, dir })
  }
  run.analyse(dir)
  // The scenes draw at most ~2,000 calls; 8,000 per frame leaves room for
  // the heaviest to change between commits without one frame costing 1 MB.
  return readAtlas(join(dir, '.codedocs', 'index.db'), run.name, {
    calls: 8000,
  })
}

/** A commit that does not analyse — no TypeScript yet, a broken tree. */
function emptyFrame(name: string, commit: Commit): Atlas {
  return {
    name,
    commit: commit.sha,
    analysedAt: '',
    projects: [],
    files: [],
    calls: [],
    imports: [],
  }
}

/** The JSON at `path`, or else `compute()`'s result, stored there unless `null`. */
function cached<T>(path: string, compute: () => T | null): T | null {
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as T
  const value = compute()
  if (value !== null) writeFileSync(path, JSON.stringify(value))
  return value
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`
}

/** Analyses the commit now, or gives an empty frame if it will not analyse. */
function analyseOrEmpty(
  run: Run,
  commit: Commit,
  tree: LazyTree,
  notes: string[],
): Atlas {
  const started = Date.now()
  try {
    const atlas = analyse(run, tree.dir())
    notes.push(`analysed in ${seconds(started)}`)
    return atlas
  } catch (error) {
    // An empty frame, not a failed timeline.
    notes.push(`not analysed: ${String(error).split('\n')[0]}`)
    return emptyFrame(run.name, commit)
  }
}

/**
 * The frame's fallow readings, from the cache or run now. None when fallow is
 * off or fails, or the frame is empty and has nothing to read health onto.
 */
function readingFor(
  run: Run,
  commit: Commit,
  atlas: Atlas,
  tree: LazyTree,
  notes: string[],
): FallowReading | null {
  if (!run.fallow || atlas.files.length === 0) return null
  return cached(join(run.cacheDir, `${commit.sha}.fallow.json`), () => {
    const started = Date.now()
    const reading = readFallow(tree.dir())
    notes.push(`fallow in ${seconds(started)}`)
    return reading
  })
}

/**
 * One frame. The analysis and the fallow readings are cached apart, so adding
 * fallow to an old timeline checks each commit out again but never
 * re-analyses it.
 */
function frameAt(run: Run, commit: Commit): Atlas {
  const tree = lazyTree(run, commit.sha)
  const notes: string[] = []
  try {
    const atlas = cached(join(run.cacheDir, `${commit.sha}.json`), () =>
      analyseOrEmpty(run, commit, tree, notes),
    )!
    const reading = readingFor(run, commit, atlas, tree, notes)
    run.log(`${atlas.files.length} files; ${notes.join(', ') || 'cached'}`)
    return reading ? withHealth(atlas, reading.report, reading.deadCode) : atlas
  } finally {
    tree.close()
  }
}

/**
 * Builds the timeline, oldest commit first. The repository's own working tree
 * is never touched.
 */
export function buildTimeline(options: TimelineOptions): Timeline {
  const run: Run = {
    ...options,
    // vscode's first-parent log for one year is ~1.5 MB, past Node's 1 MB default.
    git: (...args) =>
      execFileSync('git', ['-C', options.repo, ...args], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }).trim(),
    modules: nodeModules(options.repo),
  }
  mkdirSync(run.cacheDir, { recursive: true })
  const commits = pickCommits(run)
  const frames = commits.map((commit, k) => {
    run.log(
      `[${k + 1}/${commits.length}] ${commit.sha.slice(0, 7)} ${commit.subject.slice(0, 50)}`,
    )
    return frameAt(run, commit)
  })
  return { name: options.name, commits, frames }
}
