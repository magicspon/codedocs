/**
 * Builds a timeline: the repository analysed at a spread of past commits.
 *
 *     pnpm --filter @codedocs/code-art timeline <repo> [--frames 16] [--name x] [--no-fallow]
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
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import type { Atlas, Commit, Timeline } from '../src/lib/atlas.ts'
import { fromCaller } from './caller.ts'
import { withHealth } from './fallow-health.ts'
import { readAtlas } from './read-index.ts'
import { readFallow, type FallowReading } from './read-fallow.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string', default: '16' },
    name: { type: 'string' },
    'no-fallow': { type: 'boolean', default: false },
  },
})
const repo = fromCaller(positionals[0] ?? '.')
const frameCount = Math.max(2, Number(values.frames))
const name = values.name ?? basename(repo)
const useFallow = !values['no-fallow']
const here = import.meta.dirname
const cli = resolve(here, '../../../packages/cli/dist/bin.js')
if (!existsSync(cli)) {
  console.error(
    `no codedocs build at ${cli} — run \`pnpm build\` at the repo root first`,
  )
  process.exit(1)
}

// vscode's first-parent log for one year is ~1.5 MB, past Node's 1 MB default.
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim()

/** `frameCount` commits spread evenly along first-parent history, always ending at HEAD. */
function pickCommits(): Commit[] {
  const lines = git(
    'log',
    '--first-parent',
    '--reverse',
    '--format=%H%x09%cI%x09%s',
  ).split('\n')
  const picks = new Set<number>()
  for (let k = 0; k < frameCount; k++)
    picks.add(Math.round((k / (frameCount - 1)) * (lines.length - 1)))
  return [...picks].map((i) => {
    const [sha = '', date = '', subject = ''] = lines[i]!.split('\t')
    return { sha, date, subject }
  })
}

/** Every `node_modules` directory near the top of the repo, so a worktree can borrow them. */
function nodeModules(dir: string, depth = 0): string[] {
  if (depth > 3) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.name === '.git' ||
      entry.name === '.codedocs'
    )
      continue
    const path = join(dir, entry.name)
    if (entry.name === 'node_modules') found.push(path)
    else found.push(...nodeModules(path, depth + 1))
  }
  return found
}

/**
 * Mirrors one `node_modules` directory into the worktree `tree`.
 *
 * Third-party packages are linked as they are. A workspace package is not:
 * pnpm links it to the *current* checkout, and the checker would follow that
 * link and index today's source inside an old frame. It is pointed at the
 * worktree's own copy instead, or left out if that commit did not have it.
 */
function mirror(source: string, target: string, tree: string): void {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (existsSync(to)) continue
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      mirror(from, to, tree)
      continue
    }
    const real = realpathSync(from)
    const workspace =
      real.startsWith(repo + sep) && !real.includes(`${sep}node_modules${sep}`)
    if (!workspace) symlinkSync(from, to)
    else {
      const own = join(tree, relative(repo, real))
      if (existsSync(own)) symlinkSync(own, to)
    }
  }
}

/**
 * A throwaway worktree at `sha`, checked out on first use, so a frame that is
 * fully cached never touches git.
 */
interface LazyTree {
  readonly dir: () => string
  readonly close: () => void
}

function lazyTree(sha: string): LazyTree {
  let dir: string | undefined
  return {
    dir: () => {
      if (dir) return dir
      dir = join(mkdtempSync(join(tmpdir(), 'code-art-')), 'tree')
      git('worktree', 'add', '--quiet', '--detach', '--force', dir, sha)
      return dir
    },
    close: () => {
      if (dir) git('worktree', 'remove', '--force', dir)
    },
  }
}

/** Analyses the checkout at `dir` and reads it back. */
function analyse(dir: string): Atlas {
  for (const source of modules) {
    const target = join(dir, relative(repo, source))
    if (existsSync(resolve(target, '..'))) mirror(source, target, dir)
  }
  execFileSync('node', [cli, 'analyse', '--cwd', dir], { stdio: 'ignore' })
  // The scenes draw at most ~2,000 calls; 8,000 per frame leaves room for
  // the heaviest to change between commits without one frame costing 1 MB.
  return readAtlas(join(dir, '.codedocs', 'index.db'), name, { calls: 8000 })
}

/** A commit that does not analyse — no TypeScript yet, a broken tree. */
function emptyFrame(commit: Commit): Atlas {
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

const cacheDir = join(here, '..', '.cache', name)
mkdirSync(cacheDir, { recursive: true })
const modules = nodeModules(repo)

/** Analyses the commit now, or gives an empty frame if it will not analyse. */
function analyseOrEmpty(
  commit: Commit,
  tree: LazyTree,
  notes: string[],
): Atlas {
  const started = Date.now()
  try {
    const atlas = analyse(tree.dir())
    notes.push(`analysed in ${seconds(started)}`)
    return atlas
  } catch (error) {
    // An empty frame, not a failed timeline.
    notes.push(`not analysed: ${String(error).split('\n')[0]}`)
    return emptyFrame(commit)
  }
}

/**
 * The frame's fallow readings, from the cache or run now. None when fallow is
 * off or fails, or the frame is empty and has nothing to read health onto.
 */
function readingFor(
  commit: Commit,
  atlas: Atlas,
  tree: LazyTree,
  notes: string[],
): FallowReading | null {
  if (!useFallow || atlas.files.length === 0) return null
  return cached(join(cacheDir, `${commit.sha}.fallow.json`), () => {
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
function frameAt(commit: Commit): Atlas {
  const tree = lazyTree(commit.sha)
  const notes: string[] = []
  try {
    const atlas = cached(join(cacheDir, `${commit.sha}.json`), () =>
      analyseOrEmpty(commit, tree, notes),
    )!
    const reading = readingFor(commit, atlas, tree, notes)
    console.log(`${atlas.files.length} files; ${notes.join(', ') || 'cached'}`)
    return reading ? withHealth(atlas, reading.report, reading.deadCode) : atlas
  } finally {
    tree.close()
  }
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`
}

const commits = pickCommits()
const frames = commits.map((commit, k) => {
  process.stdout.write(
    `[${k + 1}/${commits.length}] ${commit.sha.slice(0, 7)} ${commit.subject.slice(0, 50)} — `,
  )
  return frameAt(commit)
})

const timeline: Timeline = { name, commits, frames }
const out = join(here, '..', 'src', 'data', `${name}.timeline.json`)
writeFileSync(out, JSON.stringify(timeline))
console.log(`${name}: ${frames.length} frames → ${out}`)
