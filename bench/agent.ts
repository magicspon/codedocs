/**
 * Spawns the agent under test.
 *
 * One fresh `claude -p` process per run, with no memory of the last, reading
 * the worktree that run was given. Nothing here differs between the arms — the
 * only difference is the prompt.
 */

import { spawn } from 'node:child_process'

/**
 * Tools both arms may use. `Bash` is on for both because grep and find are how
 * anyone searches a repository from a shell, and taking it from the baseline
 * would rig the comparison. Edits, subagents and the network are off: the task
 * is read-only, and a subagent's tokens are accounted separately from the loop
 * being measured.
 */
const ALLOWED = 'Read,Grep,Glob,Bash,TodoWrite'
const DISALLOWED = 'Edit,Write,NotebookEdit,Task,WebFetch,WebSearch'

/** Spawns one agent run in `root` and returns its stream, line by line. */
export function runAgent(
  prompt: string,
  model: string,
  root: string,
): Promise<string[]> {
  return new Promise((done, fail) => {
    const child = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--model',
        model,
        '--allowedTools',
        ALLOWED,
        '--disallowedTools',
        DISALLOWED,
        '--max-turns',
        '60',
        '--permission-mode',
        'bypassPermissions',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const lines: string[] = []
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) if (part.trim()) lines.push(part)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', () => {})
    child.on('error', fail)
    child.on('close', () => {
      if (buffer.trim()) lines.push(buffer)
      done(lines)
    })
  })
}
