/**
 * What an arm is: a toolset paired with a model.
 *
 * The parent issue's secondary hypothesis is that structural facts let a
 * cheaper model do work that otherwise needs a more expensive one. That cannot
 * be asked of a benchmark whose arms differ only in tools, so an arm carries
 * its model with it and a session may run any number of them.
 */

import type { Arm, RunRecord, Toolset } from './types.ts'

/** The toolsets an arm may be built on. Anything else is a typo, not an arm. */
const TOOLSETS: Toolset[] = ['baseline', 'codedocs']

/**
 * The short name a model goes by in an arm id and in the table.
 *
 * Vendor prefix and release date are dropped: they are the same across every
 * model here, so they cost a column and say nothing. `claude-haiku-4-5-20251001`
 * becomes `haiku-4-5`.
 */
function modelLabel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

/** The id an arm is known by, on disk and in the report: `codedocs@haiku-4-5`. */
function armId(toolset: Toolset, model: string): string {
  return `${toolset}@${modelLabel(model)}`
}

/** Builds an arm from its two halves. */
function makeArm(toolset: Toolset, model: string): Arm {
  return { id: armId(toolset, model), toolset, model }
}

/**
 * Reads one `--arms` entry: `codedocs`, or `codedocs@claude-opus-5`.
 *
 * The model after `@` is a full model id rather than a label, because it is
 * passed to the agent verbatim. An entry without one runs on the session's
 * `--model`, which is what keeps the like-for-like invocation short.
 */
function parseArm(entry: string, defaultModel: string): Arm {
  const at = entry.indexOf('@')
  const toolset = (at === -1 ? entry : entry.slice(0, at)).trim() as Toolset
  const model = at === -1 ? defaultModel : entry.slice(at + 1).trim()
  if (!TOOLSETS.includes(toolset)) {
    throw new Error(
      `unknown toolset "${toolset}" in --arms; expected one of ${TOOLSETS.join(', ')}`,
    )
  }
  if (!model) throw new Error(`arm "${entry}" names no model`)
  return makeArm(toolset, model)
}

/**
 * The arms a session runs, from `--arms` and `--model`.
 *
 * Duplicates are rejected rather than deduplicated: two identical arms in one
 * invocation is a mistake in the command line, and silently running one of them
 * would make the session's shape differ from what was asked for.
 */
export function parseArms(spec: string, defaultModel: string): Arm[] {
  const arms = spec
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseArm(entry, defaultModel))
  const seen = new Set<string>()
  for (const arm of arms) {
    if (seen.has(arm.id)) throw new Error(`--arms names ${arm.id} twice`)
    seen.add(arm.id)
  }
  if (arms.length === 0) throw new Error('--arms names no arm')
  return arms
}

/** A record as it was written before an arm carried its model. */
type LegacyRecord = Omit<RunRecord, 'arm'> & {
  arm: Toolset
  /** The session's model, which every arm shared. */
  model?: string
}

/**
 * Reads a saved record, widening the arm of one written before this change.
 *
 * Those runs all shared a single session model, recorded beside the arm rather
 * than inside it, so the pair is recoverable and no result has to be thrown
 * away to change the shape.
 */
export function readRecord(json: string): RunRecord {
  const record = JSON.parse(json) as RunRecord | LegacyRecord
  if (typeof record.arm !== 'string') return record as RunRecord
  const legacy = record as LegacyRecord
  return {
    ...legacy,
    arm: makeArm(legacy.arm, legacy.model ?? 'unknown'),
  }
}

/** Arms in the order the report prints them: baselines first, then by model. */
function orderArms(arms: Arm[]): Arm[] {
  const rank = (arm: Arm): number => TOOLSETS.indexOf(arm.toolset)
  return [...arms].sort(
    (a, b) => rank(a) - rank(b) || a.model.localeCompare(b.model),
  )
}

/** The distinct arms appearing in a set of records, in report order. */
export function armsIn(records: RunRecord[]): Arm[] {
  const byId = new Map(records.map((record) => [record.arm.id, record.arm]))
  return orderArms([...byId.values()])
}

/**
 * The arm every delta in the report is read against.
 *
 * The baseline arm with the most runs behind it: a run with no tool in it, on
 * the model the session leaned on. Choosing by run count rather than by name
 * keeps the reference present in as many blocks as possible, and a block the
 * reference did not run in prints no delta rather than a misleading one.
 */
export function referenceArm(records: RunRecord[]): Arm | undefined {
  const arms = armsIn(records)
  const runs = (arm: Arm): number =>
    records.filter((record) => record.arm.id === arm.id).length
  const baselines = arms.filter((arm) => arm.toolset === 'baseline')
  const ranked = [...(baselines.length > 0 ? baselines : arms)].sort(
    (a, b) => runs(b) - runs(a),
  )
  return ranked[0]
}
