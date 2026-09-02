/**
 * What one run consumed, accumulated as the stream is walked.
 *
 * A tally answers three questions about a run: which tools it called, which
 * repository files it opened, and whether it reached for codedocs. The first
 * two are what the benchmark compares; the third decides whether the run counts
 * as the arm it claims to be.
 */

import { normalise } from './paths.ts'
import type { RunMetrics } from './types.ts'

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
    usedCodedocs: false,
    rateLimitedUntil: null,
  }
}

/** Commands that put a file's contents into the transcript. `grep` is a search, not an open. */
const READS_A_FILE = /\b(?:cat|bat|head|tail|less|more|nl|awk|sed)\b/

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

/** Banks one `tool_use` block: the call itself, and any file it opened. */
export function recordToolUse(
  block: { name?: string; input?: Record<string, unknown> },
  tally: Tally,
): void {
  if (!block.name) return
  const args = block.input ?? {}
  tally.toolCalls += 1
  tally.byName[block.name] = (tally.byName[block.name] ?? 0) + 1
  if (callsCodedocs(block.name, args)) tally.usedCodedocs = true
  for (const path of filesFromToolUse(block.name, args)) tally.files.add(path)
}

/** Characters of one tool result, which is what the next turn has to carry. */
export function resultChars(body: unknown): number {
  return typeof body === 'string'
    ? body.length
    : JSON.stringify(body ?? '').length
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
  toolOutputChars: 0,
  turns: 0,
  durationMs: 0,
  costUsd: 0,
}
