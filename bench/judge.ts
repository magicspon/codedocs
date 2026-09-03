/**
 * One reading of one patch by a model that never learns who wrote it.
 *
 * The judge runs with no tools at all. That is not a convenience: a judge that
 * could read the repository could find the fix, the tests around it, or the
 * commit that landed it, and would then be grading its own search rather than
 * the patch in front of it.
 */

import { spawn } from 'node:child_process'
import { CORRECTNESS, judgePrompt, SIMILARITY } from './rubric.ts'
import type { JudgeInput } from './rubric.ts'
import type { RunTotals } from './tally.ts'
import type { Correctness, JudgeVerdict, Similarity } from './types.ts'

/**
 * Every tool the judge is refused, named rather than left to a default: the
 * refusal is the measurement's integrity, so it is stated where it can be read.
 */
const NO_TOOLS =
  'Read,Grep,Glob,Bash,TodoWrite,Edit,Write,NotebookEdit,Task,WebFetch,WebSearch'

/** Raised when a judgement could not be obtained. The run's own measurement stands regardless. */
export class JudgeFailed extends Error {}

/** The `claude -p --output-format json` envelope, in the fields this reads. */
type JudgeEnvelope = RunTotals & {
  /** The model's final text, which is where the verdict is. */
  result?: string
  is_error?: boolean
}

/** Runs the judge once and returns the envelope it printed. */
function askJudge(prompt: string, model: string): Promise<JudgeEnvelope> {
  return new Promise((done, fail) => {
    const child = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--model',
        model,
        '--allowedTools',
        '',
        '--disallowedTools',
        NO_TOOLS,
        // One turn: there is nothing to iterate on when there is nothing to call.
        '--max-turns',
        '1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      out += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', () => {})
    child.on('error', fail)
    child.on('close', () => {
      try {
        done(JSON.parse(out.trim()) as JudgeEnvelope)
      } catch {
        fail(new JudgeFailed(`the judge printed no JSON envelope`))
      }
    })
  })
}

/** The object inside a reply, tolerating a code fence or a sentence around it. */
function objectIn(text: string): unknown {
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open === -1 || close <= open)
    throw new JudgeFailed('the judge returned no JSON object')
  try {
    return JSON.parse(text.slice(open, close + 1))
  } catch {
    throw new JudgeFailed('the judge returned JSON that would not parse')
  }
}

/** Reads one grade, refusing anything the rubric does not define. */
function grade<T extends string>(
  value: unknown,
  scale: readonly T[],
  axis: string,
): T {
  if (
    typeof value === 'string' &&
    (scale as readonly string[]).includes(value)
  ) {
    return value as T
  }
  throw new JudgeFailed(`the judge returned "${String(value)}" for ${axis}`)
}

/** The tokens one judgement processed, counted as a run's are. */
function tokensOf(envelope: JudgeEnvelope): number {
  const usage = envelope.usage ?? {}
  const token = (key: string): number => usage[key] ?? 0
  return (
    token('input_tokens') +
    token('output_tokens') +
    token('cache_read_input_tokens') +
    token('cache_creation_input_tokens')
  )
}

/** Turns one envelope into the verdict it carries, or refuses it. */
function verdictFrom(envelope: JudgeEnvelope): JudgeVerdict {
  if (envelope.is_error)
    throw new JudgeFailed('the judge run reported an error')
  const body = objectIn(envelope.result ?? '') as Record<string, unknown>
  return {
    correctness: grade<Correctness>(
      body['correctness'],
      CORRECTNESS,
      'correctness',
    ),
    similarity: grade<Similarity>(body['similarity'], SIMILARITY, 'similarity'),
    why: typeof body['why'] === 'string' ? body['why'] : '',
    judgedAt: new Date().toISOString(),
    costUsd: envelope.total_cost_usd ?? 0,
    tokensTotal: tokensOf(envelope),
  }
}

/**
 * Judges one patch once.
 *
 * Retried a single time, because an unparseable reply is a formatting slip
 * rather than a judgement — and because a second retry would start paying real
 * money to argue with a model that is not answering.
 */
export async function judgeOnce(
  input: JudgeInput,
  model: string,
): Promise<JudgeVerdict> {
  const prompt = judgePrompt(input)
  try {
    return verdictFrom(await askJudge(prompt, model))
  } catch (error) {
    if (!(error instanceof JudgeFailed)) throw error
    const stricter = `${prompt}\n\nReturn the JSON object only. Your previous reply could not be read: ${error.message}.`
    return verdictFrom(await askJudge(stricter, model))
  }
}
