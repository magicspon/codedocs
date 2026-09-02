/**
 * The task put to the agent, and the one difference between the two arms.
 *
 * Both arms read the same issue and are asked for the same thing: the fix,
 * left in the worktree. The codedocs arm is additionally told the tool exists,
 * and pays for that briefing in input tokens on every turn.
 */

import { CODEDOCS } from './paths.ts'
import type { ArmName, BenchCase } from './types.ts'

/**
 * The extra briefing the codedocs arm gets, and the baseline does not. Its cost
 * in input tokens is charged to the codedocs arm on every turn, which is the
 * real cost of putting a tool in front of an agent.
 */
function codedocsBriefing(root: string): string {
  return `
This repository has a codedocs index already built. codedocs answers structural
questions about the code without you opening files. Run it as:

  ${CODEDOCS} <operation> <subject> --cwd ${root}

  symbol <glob>      every symbol whose name matches, with file:line
  callers <subject>  every call edge into a subject
  callees <subject>  every call edge out of a subject
  trace <root>       every path of calls out of a root; --depth N bounds it

A subject is either \`path/to/file.ts#SymbolName\` or a bare name, which may
match several symbols — an ambiguous name is answered, not rejected. Add
--limit N to cap results. A question takes about two seconds.

Use it as much or as little as you find useful.
`.trim()
}

/**
 * The task, identical in both arms.
 *
 * No answer is asked for, because the patch is the answer: the harness reads
 * the diff out of the worktree, so there is nothing for the agent to report and
 * nothing for it to claim. Tests are ruled out to keep the diffs comparable —
 * the ground truth excludes test files, and a run that spent its turns on one
 * would be measured on work no case is scored against.
 */
export function buildPrompt(
  bench: BenchCase,
  arm: ArmName,
  root: string,
): string {
  const briefing = arm === 'codedocs' ? `\n${codedocsBriefing(root)}\n` : ''
  return `You are working in the VS Code repository. Below is a bug report filed against it.

Your job is to fix it. Edit the source in this checkout and leave the fix in the
working tree — do not commit it. This checkout has no dependencies installed, so
nothing here builds, runs or tests; your patch will be judged by reading it.
${briefing}
<issue>
# ${bench.title}  (microsoft/vscode#${bench.issue})

${bench.body}
</issue>

Change as little as the bug needs, and change only source: no tests, and no new
files unless the fix cannot be written without one. When the patch is written,
stop. There is nothing to report — the patch is the answer.`
}
