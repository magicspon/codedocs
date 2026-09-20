import type { Playhead, Series } from '../lib/series.ts'

/** What every scene is given. */
export interface SceneProps {
  readonly series: Series
  /** Read every animation frame; the scene draws the history at `playhead.t`. */
  readonly playhead: Playhead
  /** Whether the health lens is on: fallow's readings drawn over the scene. */
  readonly lens: boolean
  /** Called with the file under the pointer, by its index in `series.merged.files`, or `null`. */
  readonly onHover: (file: number | null) => void
}
