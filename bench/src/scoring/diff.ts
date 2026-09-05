/**
 * The patch a run produced: captured from its worktree, read back as files and
 * hunks.
 *
 * The diff is the run's answer. It is taken straight from git rather than from
 * anything the agent says about its own work, so a run is scored on what it
 * actually changed, and the same text is kept on disk for a human to read.
 */

import { execFileSync } from 'node:child_process'

/** One file the diff changed, and the hunks it changed in it. */
export type DiffFile = {
  /** Repository-relative, taken from the diff's post-image side. */
  path: string
  /** Each hunk as its `@@` header plus its body, exactly as git printed it. */
  hunks: string[]
}

/** Runs git inside a run's worktree. Diffs can be large, so the buffer is generous. */
function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

/**
 * The patch left in a worktree, as unified diff text.
 *
 * Diffed against the case's base commit rather than `HEAD`, so an agent that
 * committed its work is still measured on the same change. `add -A -N` records
 * the existence of any new file without staging its contents, which is what
 * makes a file the agent created appear in the diff at all; ignored paths — a
 * build output, an installed dependency — stay out of it.
 */
export function captureDiff(root: string, baseCommit: string): string {
  git(root, ['add', '-A', '-N'])
  return git(root, ['diff', '--no-color', '--no-ext-diff', baseCommit])
}

/** The post-image path a `+++`/`---` line names, or null for `/dev/null`. */
function pathFrom(line: string): string | null {
  const path = line.slice(4).trim()
  if (path === '/dev/null') return null
  // Both sides carry a one-letter prefix git adds; the path is what follows it.
  return path.replace(/^[ab]\//, '')
}

/**
 * Reads unified diff text into the files it changed.
 *
 * A deleted file has no post-image, so its `--- a/path` side names it; every
 * other case is named by `+++ b/path`. A file with no hunks — a pure rename, a
 * mode change — is still a file the diff touched, so it is kept.
 */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let hunk: string[] | null = null

  const closeHunk = (): void => {
    if (current && hunk) current.hunks.push(hunk.join('\n'))
    hunk = null
  }

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      closeHunk()
      current = { path: '', hunks: [] }
      files.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const path = pathFrom(line)
      // `+++` wins where both are real, because the post-image is the file the
      // repository will have; `---` is only reached when the file was deleted.
      if (path && (line.startsWith('+++ ') || !current.path))
        current.path = path
      continue
    }
    if (line.startsWith('@@')) {
      closeHunk()
      hunk = [line]
      continue
    }
    if (hunk) hunk.push(line)
  }
  closeHunk()
  return files.filter((file) => file.path !== '')
}
