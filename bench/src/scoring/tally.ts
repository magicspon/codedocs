/**
 * What one run consumed, accumulated as the stream is walked.
 *
 * A tally answers four questions about a run: which tools it called, which
 * repository files it opened, how much of the repository those looks returned,
 * and whether it reached for codedocs. The first three are what the benchmark
 * compares; the last decides whether the run counts as the arm it claims to be.
 */

import { normalise } from '../core/paths.ts'
import type { RunMetrics } from '../core/types.ts'

/**
 * The fields of the terminal `result` event that become metrics.
 *
 * Named structurally rather than as the stream event itself, so the tally
 * depends on what it reads and not on the shape of the transport.
 */
export type RunTotals = {
  usage?: Record<string, number>
  num_turns?: number
  duration_ms?: number
  total_cost_usd?: number
}

/** What one pass over the stream accumulates before it becomes `RunMetrics`. */
export type Tally = {
  byName: Record<string, number>
  files: Set<string>
  toolCalls: number
  outputChars: number
  /** Lines of repository content the inspecting calls returned. */
  sourceLines: number
  /** Tool calls that inspected the repository. */
  steps: number
  /**
   * The ids of inspecting calls still waiting for their result.
   *
   * A `tool_result` carries no hint of what it answers, so what a call was has
   * to be remembered from the `tool_use` that opened it.
   */
  pending: Set<string>
  usedCodedocs: boolean
  /** Epoch seconds the quota frees up, set when the API refused the run outright. */
  rateLimitedUntil: number | null
}

/** A tally with nothing banked yet. */
export function emptyTally(): Tally {
  return {
    byName: {},
    files: new Set<string>(),
    toolCalls: 0,
    outputChars: 0,
    sourceLines: 0,
    steps: 0,
    pending: new Set<string>(),
    usedCodedocs: false,
    rateLimitedUntil: null,
  }
}

/** Commands that put a file's contents into the transcript. `grep` is a search, not an open. */
const READS_A_FILE = /\b(?:cat|bat|head|tail|less|more|nl|awk|sed)\b/

/**
 * Commands that ask the repository a question without opening a named file.
 *
 * Only `explorationSteps` and `sourceLinesRead` read this. `filesOpened` must
 * not: a search names no file it opened, and counting one would inflate it.
 */
const SEARCHES_THE_REPO = /\b(?:grep|rg|ag|find|fd|ls|glob)\b/

/**
 * Pulls repository-relative paths out of a shell command that reads files.
 * Deliberately conservative: a path this misses undercounts the arm that ran
 * the command, so the bias is always against the tool being sold.
 */
function pathsFromBash(command: string): string[] {
  if (!READS_A_FILE.test(command)) return []
  const found: string[] = []
  for (const token of command.split(/[\s;|&<>()'"]+/)) {
    if (token.startsWith('-')) continue
    if (!/\.(ts|tsx|js|jsx|css|json|md)$/.test(token)) continue
    found.push(token)
  }
  return found
}

/** The repository files one tool call opened. A search is not an open. */
function filesFromToolUse(
  name: string,
  args: Record<string, unknown>,
): string[] {
  if (name === 'Read') {
    const path = args['file_path']
    return typeof path === 'string' ? [normalise(path)] : []
  }
  if (name === 'Bash') {
    const command = args['command']
    return typeof command === 'string'
      ? pathsFromBash(command).map(normalise)
      : []
  }
  return []
}

/**
 * An actual invocation of the codedocs CLI.
 *
 * The binary name alone is not enough: the checkout under test lives inside a
 * directory called `codedocs`, so every absolute path in the run contains the
 * word and a bare substring test marks all of them as tool use. Requiring one
 * of the CLI's operations after the name separates running it from merely
 * naming a path that passes through it.
 */
const INVOKES_CODEDOCS =
  /(?:^|[\s'"/])codedocs\s+(?:analyse|symbol|callers|callees|trace|mcp)\b/

/** True when a tool call shelled out to codedocs, which decides an arm's validity. */
function callsCodedocs(name: string, args: Record<string, unknown>): boolean {
  const command = args['command']
  return (
    name === 'Bash' &&
    typeof command === 'string' &&
    INVOKES_CODEDOCS.test(command)
  )
}

/**
 * True when a call asked the repository something.
 *
 * A read, a search and a codedocs query are all one thing here — a look at the
 * repository — because the benchmark is comparing the cost of looking, and
 * charging a look differently depending on which tool performed it would decide
 * the answer in advance. `git log`, `wc` and the rest are bookkeeping about the
 * checkout rather than a look at its contents, so they are not steps.
 */
function inspectsRepo(name: string, args: Record<string, unknown>): boolean {
  if (name === 'Read' || name === 'Grep' || name === 'Glob') return true
  if (name !== 'Bash') return false
  const command = args['command']
  if (typeof command !== 'string') return false
  return (
    READS_A_FILE.test(command) ||
    SEARCHES_THE_REPO.test(command) ||
    INVOKES_CODEDOCS.test(command)
  )
}

/** Banks one `tool_use` block: the call itself, any file it opened, and the look it took. */
export function recordToolUse(
  block: { id?: string; name?: string; input?: Record<string, unknown> },
  tally: Tally,
): void {
  if (!block.name) return
  const args = block.input ?? {}
  tally.toolCalls += 1
  tally.byName[block.name] = (tally.byName[block.name] ?? 0) + 1
  if (callsCodedocs(block.name, args)) tally.usedCodedocs = true
  for (const path of filesFromToolUse(block.name, args)) tally.files.add(path)
  if (inspectsRepo(block.name, args)) {
    tally.steps += 1
    // The lines this look returns are banked when its result arrives.
    if (block.id) tally.pending.add(block.id)
  }
}

/** Characters of one tool result, which is what the next turn has to carry. */
function resultChars(body: unknown): number {
  return typeof body === 'string'
    ? body.length
    : JSON.stringify(body ?? '').length
}

/**
 * Lines of one tool result. Blank lines are not counted: a read of a sparsely
 * spaced file would otherwise score higher than the same code packed tighter,
 * which is a fact about formatting and not about how much was read.
 */
function resultLines(body: unknown): number {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '')
  return text.split('\n').filter((line) => line.length > 0).length
}

/**
 * Banks one `tool_result`: what it costs the next turn, and — when it answers a
 * look at the repository — how much of the repository it carried.
 */
export function recordToolResult(
  block: { tool_use_id?: string; content?: unknown },
  tally: Tally,
): void {
  tally.outputChars += resultChars(block.content)
  if (block.tool_use_id && tally.pending.delete(block.tool_use_id)) {
    tally.sourceLines += resultLines(block.content)
  }
}

/**
 * Builds the metrics from the terminal `result` event, which already aggregates
 * the loop. Per-message usage is repeated on every content block, so summing it
 * during the fold would multiply the count.
 */
export function metricsFrom(event: RunTotals, tally: Tally): RunMetrics {
  const usage = event.usage ?? {}
  const token = (key: string): number => usage[key] ?? 0
  const input = token('input_tokens')
  const output = token('output_tokens')
  const cacheRead = token('cache_read_input_tokens')
  const cacheCreation = token('cache_creation_input_tokens')
  return {
    // Everything the loop processed. Cache reads are counted because a cached
    // token is still a token the model read, and a shorter search is exactly
    // what shrinks it.
    tokensTotal: input + output + cacheRead + cacheCreation,
    tokensInput: input,
    tokensOutput: output,
    tokensCacheRead: cacheRead,
    tokensCacheCreation: cacheCreation,
    toolCalls: tally.toolCalls,
    toolCallsByName: tally.byName,
    filesOpened: [...tally.files].sort(),
    sourceLinesRead: tally.sourceLines,
    explorationSteps: tally.steps,
    toolOutputChars: tally.outputChars,
    turns: event.num_turns ?? 0,
    durationMs: event.duration_ms ?? 0,
    costUsd: event.total_cost_usd ?? 0,
  }
}

/** An empty result, for a run whose stream carried no terminal event. */
export const NO_METRICS: RunMetrics = {
  tokensTotal: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreation: 0,
  toolCalls: 0,
  toolCallsByName: {},
  filesOpened: [],
  sourceLinesRead: 0,
  explorationSteps: 0,
  toolOutputChars: 0,
  turns: 0,
  durationMs: 0,
  costUsd: 0,
}
