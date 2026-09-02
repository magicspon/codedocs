/**
 * Folds one agent stream into the numbers the benchmark compares.
 *
 * The stream is the only record of what a run did, and it is replayable: every
 * metric, every score and every validity check here is a pure function of it,
 * so a fix to any of them can be applied to runs already on disk.
 */

import {
  emptyTally,
  metricsFrom,
  NO_METRICS,
  recordToolResult,
  recordToolUse,
} from './tally.ts'
import type { Tally } from './tally.ts'
import type { RunMetrics } from './types.ts'

/** One content block inside a stream message. */
type StreamBlock = {
  type: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  /** Present on a `tool_result`: the `tool_use` it answers. */
  tool_use_id?: string
  content?: unknown
}

/** One line of `claude --output-format stream-json`. Only the fields this harness reads are named. */
type StreamEvent = {
  type: string
  subtype?: string
  message?: {
    content?: StreamBlock[]
    usage?: Record<string, number>
  }
  usage?: Record<string, number>
  num_turns?: number
  duration_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  rate_limit_info?: { status?: string; resetsAt?: number }
}

/** Everything one stream says about the run that produced it. */
export type ParsedStream = {
  metrics: RunMetrics
  usedCodedocs: boolean
  rateLimitedUntil: number | null
}

/** Yields the events of a stream, skipping any line that is not JSON. */
function* decode(lines: string[]): Generator<StreamEvent> {
  for (const line of lines) {
    try {
      yield JSON.parse(line) as StreamEvent
    } catch {
      continue
    }
  }
}

/** Banks every tool call the model made in one assistant message. */
function applyAssistant(content: StreamBlock[], tally: Tally): void {
  for (const block of content)
    if (block.type === 'tool_use') recordToolUse(block, tally)
}

/** Banks the tool output one user message carried back into the context. */
function applyUser(content: StreamBlock[], tally: Tally): void {
  for (const block of content) {
    if (block.type === 'tool_result') recordToolResult(block, tally)
  }
}

/** Applies one event to the tally, and returns the metrics once the loop ends. */
function applyEvent(event: StreamEvent, tally: Tally): RunMetrics | null {
  const content = event.message?.content ?? []
  if (event.type === 'assistant') applyAssistant(content, tally)
  if (event.type === 'user') applyUser(content, tally)
  // A refused run returns an empty stream that looks exactly like an agent
  // that answered nothing. Catching it here is what keeps the two apart.
  if (
    event.type === 'rate_limit_event' &&
    event.rate_limit_info?.status === 'rejected'
  ) {
    tally.rateLimitedUntil = event.rate_limit_info.resetsAt ?? 0
  }
  return event.type === 'result' ? metricsFrom(event, tally) : null
}

/** Folds an agent's stream into the metrics the benchmark compares. */
export function parseStream(lines: string[]): ParsedStream {
  const tally = emptyTally()
  let metrics = NO_METRICS

  for (const event of decode(lines)) {
    const final = applyEvent(event, tally)
    if (final) metrics = final
  }

  return {
    metrics,
    usedCodedocs: tally.usedCodedocs,
    rateLimitedUntil: tally.rateLimitedUntil,
  }
}
