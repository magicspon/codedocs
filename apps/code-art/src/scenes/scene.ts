import type { Playhead, Series } from '../lib/series.ts'
import type { SystemClaims } from '../lib/system-nav.ts'
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
  /** The file the path keys point at from the selected one, or `null`. */
  readonly aim?: number | null
  /** Whether to isolate the trace: hide what it does not reach and draw the rest in close. */
  readonly isolate?: boolean
  /** Told which plain keys a picked file's system is using, so the rest stand aside. */
  readonly onClaims?: (claims: SystemClaims) => void
}
