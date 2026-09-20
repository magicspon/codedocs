import type { Commit, FileDatum } from './atlas.ts'
import type { Series } from './series.ts'

/**
 * Reading one frame of a series.
 *
 * The playhead runs to the last commit and the HUD lags a frame behind it, so
 * every lookup clamps instead of falling off the end.
 */

/** The merged files as they stood at `frame`. */
function rowAt(series: Series, frame: number): readonly (FileDatum | null)[] {
  return series.at[Math.min(frame, series.at.length - 1)] ?? []
}

/** The file under the pointer, or undefined when nothing is hovered. */
export function hoveredFile(
  series: Series | null,
  frame: number,
  hovered: number | null,
): FileDatum | undefined {
  if (series === null || hovered === null) return undefined
  return rowAt(series, frame)[hovered] ?? undefined
}

/** What the HUD says about a frame. */
export interface FrameSummary {
  /** Files that existed at this frame, of all the ones the series merged. */
  readonly present: number
  readonly commit: Commit | undefined
}

/** The facts the HUD prints beside the pickers. */
export function frameSummary(series: Series, frame: number): FrameSummary {
  return {
    present: rowAt(series, frame).filter(Boolean).length,
    commit: series.commits[Math.min(frame, series.commits.length - 1)],
  }
}
