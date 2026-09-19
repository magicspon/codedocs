/**
 * Builds a timeline: the repository analysed at a spread of past commits.
 *
 *     pnpm --filter @codedocs/code-art timeline <repo> [--frames 16] [--name x]
 *
 * The index holds one moment, so history has to be re-analysed. Each commit is
 * checked out into a throwaway worktree outside the repo — inside it, the next
 * `codedocs analyse` of the repo would discover it as more projects — with the
 * repo's `node_modules` linked in so old commits still analyse at `typed`
 * fidelity. Each frame is cached by sha, so asking for more frames later only
 * analyses the new ones.
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
import { readAtlas } from './read-index.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string', default: '16' },
    name: { type: 'string' },
  },
})
const repo = resolve(positionals[0] ?? '.')
const frameCount = Math.max(2, Number(values.frames))
const name = values.name ?? basename(repo)
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

/** Analyses one commit in a throwaway worktree and reads it back. */
function analyse(commit: Commit, modules: readonly string[]): Atlas {
  const dir = join(mkdtempSync(join(tmpdir(), 'code-art-')), 'tree')
  git('worktree', 'add', '--detach', '--force', dir, commit.sha)
  try {
    for (const source of modules) {
      const target = join(dir, relative(repo, source))
      if (existsSync(resolve(target, '..'))) mirror(source, target, dir)
    }
    execFileSync('node', [cli, 'analyse', '--cwd', dir], { stdio: 'ignore' })
    // The scenes draw at most ~2,000 calls; 8,000 per frame leaves room for
    // the heaviest to change between commits without one frame costing 1 MB.
    return readAtlas(join(dir, '.codedocs', 'index.db'), name, { calls: 8000 })
  } finally {
    git('worktree', 'remove', '--force', dir)
  }
}

const cacheDir = join(here, '..', '.cache', name)
mkdirSync(cacheDir, { recursive: true })
const commits = pickCommits()
const modules = nodeModules(repo)
const frames = commits.map((commit, k) => {
  const cached = join(cacheDir, `${commit.sha}.json`)
  const label = `[${k + 1}/${commits.length}] ${commit.sha.slice(0, 7)} ${commit.subject.slice(0, 50)}`
  if (existsSync(cached)) {
    console.log(`${label} (cached)`)
    return JSON.parse(readFileSync(cached, 'utf8')) as Atlas
  }
  const started = Date.now()
  let atlas: Atlas
  try {
    atlas = analyse(commit, modules)
  } catch (error) {
    // A commit that does not analyse — no TypeScript yet, a broken tree — is an
    // empty frame, not a failed timeline.
    console.log(
      `${label} could not be analysed: ${String(error).split('\n')[0]}`,
    )
    atlas = {
      name,
      commit: commit.sha,
      analysedAt: '',
      projects: [],
      files: [],
      calls: [],
      imports: [],
    }
  }
  writeFileSync(cached, JSON.stringify(atlas))
  console.log(
    `${label} — ${atlas.files.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
  return atlas
})

const timeline: Timeline = { name, commits, frames }
const out = join(here, '..', 'src', 'data', `${name}.timeline.json`)
writeFileSync(out, JSON.stringify(timeline))
console.log(`${name}: ${frames.length} frames → ${out}`)
