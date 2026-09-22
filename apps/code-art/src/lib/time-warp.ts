import { symbolCount, type FileDatum } from './atlas.ts'
import type { Series } from './series.ts'

/**
 * A timeline squeezed to the commits that touch some files. Playback steps
 * from one such commit to the next, skipping the quiet stretch between, so
 * files that changed years apart still grow one after another.
 *
 * Positions on the squeezed timeline are "steps": step `i` is `keys[i]`, and
 * the step between two keys plays only the frame before the later one, which
 * is where that frame's changes fade in.
 */

/** What a file looks like in one frame, enough to tell whether it changed. */
function shapeOf(datum: FileDatum | null | undefined): string {
  return datum ? `${datum.size}:${symbolCount(datum)}` : ''
}

/**
 * The frames at which any of `files` is born, grows, shrinks or dies, led by
 * the frame before the first, so it fades in, and closed by the last frame.
 */
export function keyFrames(series: Series, files: readonly number[]): number[] {
  const last = series.at.length - 1
  const keys: number[] = []
  series.at.forEach((row, f) => {
    const before = series.at[f - 1]
    if (files.some((i) => shapeOf(row[i]) !== shapeOf(before?.[i])))
      keys.push(f)
  })
  if (keys[0] !== undefined && keys[0] > 0) keys.unshift(keys[0] - 1)
  if (keys.at(-1) !== last) keys.push(last)
  return keys
}

/** The frame at `step` along `keys`. */
export function warp(keys: readonly number[], step: number): number {
  const i = Math.max(0, Math.min(keys.length - 1, Math.floor(step)))
  const a = keys[i]!
  const b = keys[i + 1]
  const s = step - i
  if (b === undefined || s === 0) return a
  // Jump the quiet frames: only the one before `b` has anything to show.
  return b - a > 1 ? b - 1 + s : a + s
}

/** The step along `keys` nearest frame `t`; `warp`'s inverse where one exists. */
export function unwarp(keys: readonly number[], t: number): number {
  if (t <= keys[0]!) return 0
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!
    const b = keys[i + 1]!
    if (t > b) continue
    const from = b - a > 1 ? b - 1 : a
    return i + Math.max(0, t - from) / (b - from)
  }
  return keys.length - 1
}
