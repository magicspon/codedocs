import type { Playhead, Series } from '../lib/series.ts'
import type { Trace } from '../lib/trace.ts'

/** What every scene is given. */
export interface SceneProps {
  readonly series: Series
  /** Read every animation frame; the scene draws the history at `playhead.t`. */
  readonly playhead: Playhead
  /** Whether the health lens is on: fallow's readings drawn over the scene. */
  readonly lens: boolean
  /** Called with the file under the pointer, by its index in `series.merged.files`, or `null`. */
  readonly onHover: (file: number | null) => void
  /** The search's trace, or `null` with no search: the scene dims the rest and draws the flow. */
  readonly trace: Trace | null
  /** Called with a clicked file, which becomes the search. */
  readonly onPick: (file: number) => void
}
