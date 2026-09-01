/**
 * Runs the localization benchmark: one agent, two arms, N replicates per case.
 *
 *   node bench/run.ts                      every case, 3 replicates
 *   node bench/run.ts --cases 333230       one case
 *   node bench/run.ts --replicates 1       a smoke run
 *   node bench/run.ts --arms baseline      one arm
 *
 * Each run is a fresh `claude -p` process with no memory of the last, reading
 * the pinned vscode checkout. Results land in `bench/results/` as one JSON file
 * per run, plus the raw agent stream beside it for auditing.
 */

import { spawn } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import type {
  ArmName,
  BenchCase,
  RunAnswer,
  RunMetrics,
  RunRecord,
} from './types.ts'

const BENCH = import.meta.dirname
const REPO_ROOT = resolve(BENCH, '..')
const TARGET = resolve(REPO_ROOT, 'repos/vscode')
const CODEDOCS = resolve(REPO_ROOT, 'node_modules/.bin/codedocs')
const RESULTS = join(BENCH, 'results')

/** The pinned checkout every case was verified against. A different commit invalidates the truth. */
const PINNED_COMMIT = '736a3ed72ebb9533980a2470a71a78a22bd3de4d'

/**
 * Tools both arms may use. `Bash` is on for both because grep and find are how
 * anyone searches a repository from a shell, and taking it from the baseline
 * would rig the comparison. Edits, subagents and the network are off: the task
 * is read-only, and a subagent's tokens are accounted separately from the loop
 * being measured.
 */
const ALLOWED = 'Read,Grep,Glob,Bash,TodoWrite'
const DISALLOWED = 'Edit,Write,NotebookEdit,Task,WebFetch,WebSearch'

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
function buildPrompt(bench: BenchCase, arm: ArmName): string {
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

/** One content block inside a stream message. */
type StreamBlock = {
  type: string
  name?: string
  input?: Record<string, unknown>
  content?: unknown
}

/** One line of `claude --output-format stream-json`. Only the fields this harness reads are named. */
type StreamEvent = {
  type: string
  subtype?: string
  message?: {
    content?: Array<{
      type: string
      name?: string
      input?: Record<string, unknown>
      content?: unknown
    }>
    usage?: Record<string, number>
  }
  usage?: Record<string, number>
  result?: string
  num_turns?: number
  duration_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  rate_limit_info?: { status?: string; resetsAt?: number }
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

/** Normalises any path the agent used into one repository-relative form, so a file is counted once. */
function normalise(path: string): string {
  const absolute = path.startsWith('/') ? path : join(TARGET, path)
  return relative(TARGET, absolute)
}

/** What one pass over the stream accumulates before it becomes `RunMetrics`. */
type Tally = {
  byName: Record<string, number>
  files: Set<string>
  toolCalls: number
  outputChars: number
  usedCodedocs: boolean
  /** Epoch seconds the quota frees up, set when the API refused the run outright. */
  rateLimitedUntil: number | null
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
function recordToolUse(
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
function resultChars(body: unknown): number {
  return typeof body === 'string'
    ? body.length
    : JSON.stringify(body ?? '').length
}

/**
 * Builds the metrics from the terminal `result` event, which already aggregates
 * the loop. Per-message usage is repeated on every content block, so summing it
 * during the fold would multiply the count.
 */
function metricsFrom(event: StreamEvent, tally: Tally): RunMetrics {
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
const NO_METRICS: RunMetrics = {
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
    if (block.type === 'tool_result')
      tally.outputChars += resultChars(block.content)
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
function parseStream(lines: string[]): {
  metrics: RunMetrics
  text: string
  usedCodedocs: boolean
  rateLimitedUntil: number | null
} {
  const tally: Tally = {
    byName: {},
    files: new Set<string>(),
    toolCalls: 0,
    outputChars: 0,
    usedCodedocs: false,
    rateLimitedUntil: null,
  }
  let metrics = NO_METRICS
  let text = ''

  for (const event of decode(lines)) {
    const final = applyEvent(event, tally)
    if (final) {
      metrics = final
      text = event.result ?? ''
    }
  }

  return {
    metrics,
    text,
    usedCodedocs: tally.usedCodedocs,
    rateLimitedUntil: tally.rateLimitedUntil,
  }
}

/** Reads the last fenced json block, which is where the prompt asked the answer to go. */
function extractAnswer(
  text: string,
): { files: string[]; symbols: string[] } | null {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  const last = blocks.at(-1)
  if (!last?.[1]) return null
  try {
    const parsed = JSON.parse(last[1]) as { files?: unknown; symbols?: unknown }
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter((f) => typeof f === 'string')
      : []
    const symbols = Array.isArray(parsed.symbols)
      ? parsed.symbols.filter((s) => typeof s === 'string')
      : []
    return { files, symbols }
  } catch {
    return null
  }
}

/**
 * Scores one answer against the fix commit.
 *
 * A run is correct when it named every non-test file the fix touched. Extra
 * files are recorded but do not fail the run: a fix has one true set, while a
 * plausible neighbouring file is a judgement, not an error.
 */
function score(
  answer: { files: string[]; symbols: string[] },
  bench: BenchCase,
): RunAnswer {
  const named = answer.files.map((f) => normalise(f))
  const hit = bench.truth.files.filter((t) =>
    named.some((n) => n === t || n.endsWith(`/${t}`) || t.endsWith(`/${n}`)),
  )
  const missed = bench.truth.files.filter((t) => !hit.includes(t))
  const extra = named.filter(
    (n) => !bench.truth.files.some((t) => t === n || t.endsWith(`/${n}`)),
  )
  const symbolHit = answer.symbols.some((s) =>
    bench.truth.symbols.some(
      (t) =>
        t.toLowerCase() === s.toLowerCase() ||
        s.toLowerCase().endsWith(`.${t.toLowerCase()}`),
    ),
  )
  return {
    files: answer.files,
    symbols: answer.symbols,
    filesHit: hit,
    filesMissed: missed,
    filesExtra: extra,
    symbolHit,
    correct: missed.length === 0,
  }
}

/** Spawns one agent run and returns its stream, line by line. */
function runAgent(prompt: string, model: string): Promise<string[]> {
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
      { cwd: TARGET, stdio: ['ignore', 'pipe', 'pipe'] },
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

/** Refuses to run against a moved checkout or a dirty tree, either of which voids the ground truth. */
function preflight(): void {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: TARGET,
    encoding: 'utf8',
  }).trim()
  if (head !== PINNED_COMMIT) {
    throw new Error(
      `vscode is at ${head}, but every case was verified against ${PINNED_COMMIT}`,
    )
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: TARGET,
    encoding: 'utf8',
  }).trim()
  if (dirty) throw new Error(`the vscode checkout is dirty:\n${dirty}`)
  // Warm the index, so the codedocs arm pays the per-question cost and not the
  // cold build. The cold build is reported separately in the README.
  execFileSync(CODEDOCS, ['symbol', '__warm__', '--cwd', TARGET], {
    encoding: 'utf8',
  })
}

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback
}

/** The cases to run, read from disk and narrowed by `--cases`. */
function loadCases(only: string[]): BenchCase[] {
  return readdirSync(join(BENCH, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8')) as BenchCase,
    )
    .filter((c) => only.length === 0 || only.includes(c.id))
}

/**
 * Why a run may not be counted. Each reason is a way the comparison would stop
 * being between the two things it claims to compare.
 */
function invalidReason(
  arm: ArmName,
  metrics: RunMetrics,
  answered: boolean,
  usedCodedocs: boolean,
): string | null {
  if (!answered) return 'no parseable answer block'
  if (arm === 'baseline' && usedCodedocs) return 'baseline reached for codedocs'
  if (arm === 'codedocs' && !usedCodedocs)
    return 'codedocs arm never called codedocs'
  if (metrics.turns === 0) return 'agent produced no turns'
  return null
}

/** Raised when the API refuses a run, so the session stops instead of filing empty records. */
class RateLimited extends Error {
  constructor(until: number) {
    const when = until
      ? new Date(until * 1000).toISOString()
      : 'an unknown time'
    super(`the API refused the run; the quota frees up at ${when}`)
  }
}

/** Folds one saved stream into the record the report reads. */
function recordFrom(
  lines: string[],
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
  startedAt: string,
): RunRecord {
  const { metrics, text, usedCodedocs, rateLimitedUntil } = parseStream(lines)
  if (rateLimitedUntil !== null) throw new RateLimited(rateLimitedUntil)
  const extracted = extractAnswer(text)
  return {
    caseId: bench.id,
    arm,
    replicate,
    startedAt,
    model,
    metrics,
    answer: extracted ? score(extracted, bench) : null,
    invalid: invalidReason(arm, metrics, extracted !== null, usedCodedocs),
  }
}

/** The one-line summary printed as each run lands. */
function verdictLine(record: RunRecord): string {
  const { metrics, answer, invalid } = record
  const verdict = invalid
    ? `INVALID (${invalid})`
    : answer?.correct
      ? 'hit'
      : 'miss'
  return (
    `${String(metrics.tokensTotal).padStart(9)} tok  ${String(metrics.toolCalls).padStart(3)} calls  ` +
    `${String(metrics.filesOpened.length).padStart(3)} files  ` +
    `${String(Math.round(metrics.durationMs / 1000)).padStart(4)}s  ${verdict}`
  )
}

/** Runs one (case, arm, replicate), writes its record and its raw stream. */
async function executeRun(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
): Promise<void> {
  const startedAt = new Date().toISOString()
  process.stdout.write(`  ${`${bench.id}/${arm}/r${replicate}`.padEnd(28)}`)

  const lines = await runAgent(buildPrompt(bench, arm), model)
  const stem = join(RESULTS, `${bench.id}-${arm}-r${replicate}`)
  // The stream lands first, so a refused run leaves the evidence behind.
  writeFileSync(`${stem}.stream.jsonl`, `${lines.join('\n')}\n`, 'utf8')

  let record: RunRecord
  try {
    record = recordFrom(lines, bench, arm, replicate, model, startedAt)
  } catch (error) {
    // A refused run measured nothing. Drop any record a previous attempt left
    // behind, so the report counts a missing run rather than a failed search.
    rmSync(`${stem}.json`, { force: true })
    throw error
  }
  writeFileSync(
    `${stem}.json`,
    `${JSON.stringify(record, null, '\t')}\n`,
    'utf8',
  )
  console.log(verdictLine(record))
}

/**
 * Re-derives every saved record from its stream, without spending any quota.
 *
 * Scoring and validity are pure functions of the stream, so a fix to either can
 * be applied to runs already on disk rather than paying for them twice.
 */
function rescore(cases: BenchCase[]): void {
  const byId = new Map(cases.map((c) => [c.id, c]))
  let rewritten = 0
  let skipped = 0
  for (const file of readdirSync(RESULTS).sort()) {
    const match = /^(.+)-(baseline|codedocs)-r(\d+)\.stream\.jsonl$/.exec(file)
    if (!match) continue
    const [, caseId, arm, replicate] = match as unknown as [
      string,
      string,
      ArmName,
      string,
    ]
    const bench = byId.get(caseId)
    if (!bench) continue
    const stem = join(RESULTS, `${caseId}-${arm}-r${replicate}`)
    const lines = readFileSync(`${stem}.stream.jsonl`, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    // Keep whatever the original run recorded about itself; only the derived
    // fields are being recomputed.
    let startedAt = new Date(0).toISOString()
    let model = 'unknown'
    try {
      const prior = JSON.parse(
        readFileSync(`${stem}.json`, 'utf8'),
      ) as RunRecord
      startedAt = prior.startedAt
      model = prior.model
    } catch {
      // No prior record, or an unreadable one. The stream is the source of truth.
    }
    process.stdout.write(`  ${`${caseId}/${arm}/r${replicate}`.padEnd(28)}`)
    let record: RunRecord
    try {
      record = recordFrom(
        lines,
        bench,
        arm,
        Number(replicate),
        model,
        startedAt,
      )
    } catch (error) {
      // A refused run has no measurement in it to rescore. Drop the record so
      // the report counts a missing run rather than a failed search, and leave
      // the stream in place as the evidence of what happened.
      rmSync(`${stem}.json`, { force: true })
      console.log(`REFUSED (${(error as Error).message})`)
      skipped += 1
      continue
    }
    writeFileSync(
      `${stem}.json`,
      `${JSON.stringify(record, null, '\t')}\n`,
      'utf8',
    )
    console.log(verdictLine(record))
    rewritten += 1
  }
  console.log(`\nrescored ${rewritten} run(s), skipped ${skipped} refused.`)
}

/**
 * True when a run already produced a measurement, so `--resume` can leave it alone.
 *
 * The saved stream decides this, not the saved record. A run refused partway
 * through still banks the tokens it spent before the refusal, so a token count
 * cannot tell a finished search from a truncated one — only the rejection event
 * can, and it is in the stream.
 */
function alreadyMeasured(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
): boolean {
  try {
    const path = join(RESULTS, `${bench.id}-${arm}-r${replicate}.stream.jsonl`)
    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    const { metrics, rateLimitedUntil } = parseStream(lines)
    return rateLimitedUntil === null && metrics.tokensTotal > 0
  } catch {
    return false
  }
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  const model = flag('model', 'claude-sonnet-5')
  const replicates = Number(flag('replicates', '3'))
  const cases = loadCases(flag('cases', '').split(',').filter(Boolean))
  const arms = flag('arms', 'baseline,codedocs').split(',') as ArmName[]
  const resume = has('resume')

  if (has('rescore')) {
    console.log('rescoring saved streams; no agent is run\n')
    rescore(cases)
    return
  }

  preflight()
  mkdirSync(RESULTS, { recursive: true })
  console.log(
    `${cases.length} case(s) x ${arms.length} arm(s) x ${replicates} replicate(s) on ${model}\n`,
  )

  for (let replicate = 1; replicate <= replicates; replicate += 1) {
    for (const bench of cases) {
      // The arm order alternates so that any drift over the session — rate
      // limits, machine load — lands on both arms rather than on one.
      const order = replicate % 2 === 0 ? [...arms].reverse() : arms
      for (const arm of order) {
        if (resume && alreadyMeasured(bench, arm, replicate)) {
          console.log(
            `  ${`${bench.id}/${arm}/r${replicate}`.padEnd(28)}already measured, skipped`,
          )
          continue
        }
        try {
          await executeRun(bench, arm, replicate, model)
        } catch (error) {
          if (!(error instanceof RateLimited)) throw error
          // Every later run would be refused too, and each would file a zero
          // that reads as a failed search. Stop while the results are honest.
          console.error(`\n${(error as Error).message}`)
          console.error(
            'stopping. Re-run with --resume once the quota is back to finish the rest.',
          )
          process.exitCode = 1
          return
        }
      }
    }
  }
  console.log(
    `\nwrote ${RESULTS}. Run \`node bench/report.ts\` for the comparison.`,
  )
}

await main()
