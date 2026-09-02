/**
 * The task put to the agent, and the one difference between the two arms.
 *
 * Both arms read the same issue and are asked for the same fenced answer block.
 * The codedocs arm is additionally told the tool exists, and pays for that
 * briefing in input tokens on every turn.
 */

import { CODEDOCS, TARGET } from './paths.ts'
import type { ArmName, BenchCase } from './types.ts'

/**
 * The extra briefing the codedocs arm gets, and the baseline does not. Its cost
 * in input tokens is charged to the codedocs arm on every turn, which is the
 * real cost of putting a tool in front of an agent.
 */
const CODEDOCS_BRIEFING = `
This repository has a codedocs index already built. codedocs answers structural
questions about the code without you opening files. Run it as:

  ${CODEDOCS} <operation> <subject> --cwd ${TARGET}

  symbol <glob>      every symbol whose name matches, with file:line
  callers <subject>  every call edge into a subject
  callees <subject>  every call edge out of a subject
  trace <root>       every path of calls out of a root; --depth N bounds it

A subject is either \`path/to/file.ts#SymbolName\` or a bare name, which may
match several symbols — an ambiguous name is answered, not rejected. Add
--limit N to cap results. A question takes about two seconds.

Use it as much or as little as you find useful.
`.trim()

/** The task, identical in both arms. The fenced answer block is what makes scoring exact. */
export function buildPrompt(bench: BenchCase, arm: ArmName): string {
  const briefing = arm === 'codedocs' ? `\n${CODEDOCS_BRIEFING}\n` : ''
  return `You are working in the VS Code repository. Below is a bug report filed against it.

Your job is to locate the code that must change to fix it. This is a localization
task only: do not edit any file, do not write anything, and do not build or test.
${briefing}
<issue>
# ${bench.title}  (microsoft/vscode#${bench.issue})

${bench.body}
</issue>

End your reply with exactly one fenced json block, and nothing after it:

\`\`\`json
{"files": ["src/vs/some/path.ts"], "symbols": ["someMethod"]}
\`\`\`

  files    the source files that must change, repository-relative, likeliest first
  symbols  the functions, methods or classes inside them that must change

Exclude test files from both lists. A directory is not an answer.`
}
