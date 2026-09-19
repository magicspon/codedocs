import type { Playhead, Series } from '../lib/series.ts'

/** What every scene is given. */
export interface SceneProps {
  readonly series: Series
  /** Read every animation frame; the scene draws the history at `playhead.t`. */
  readonly playhead: Playhead
  /** Called with the file under the pointer, by its index in `series.merged.files`, or `null`. */
  readonly onHover: (file: number | null) => void
}
