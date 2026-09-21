import type { JSX } from 'react'
import { hoveredFile } from './lib/frame.ts'
import type { Series } from './lib/series.ts'
import { traceHops } from './lib/trace-text.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { Controls } from './Controls.tsx'
import { FilePanel } from './FilePanel.tsx'
import { Search } from './Search.tsx'

interface HudProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (name: string) => void
  readonly lens: boolean
  readonly onLens: (on: boolean) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the hovered file's facts come from. */
  readonly frame: number
  readonly hovered: number | null
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
}

/** The overlay: pickers, a legend, the search, and the file under the pointer. */
export function Hud(props: HudProps): JSX.Element {
  if (props.datasets.length === 0) {
    return (
      <div className="hud empty">
        <h1>No data yet</h1>
        <p>
          Run <code>pnpm --filter @codedocs/code-art export &lt;repo&gt;</code>{' '}
          and reload.
        </p>
      </div>
    )
  }

  const fallow = props.series?.merged.fallow
  const file = hoveredFile(props.series, props.frame, props.hovered)
  return (
    <div className="hud">
      <div className="column">
        <Controls
          datasets={props.datasets}
          dataset={props.dataset}
          onDataset={props.onDataset}
          scenes={props.scenes}
          scene={props.scene}
          onScene={props.onScene}
          lens={props.lens}
          onLens={props.onLens}
          fallow={fallow}
          series={props.series}
          frame={props.frame}
        />
        {props.series && (
          <Search
            query={props.query}
            onQuery={props.onQuery}
            trace={props.trace}
            files={props.series.merged.files}
          />
        )}
      </div>
      {file && (
        <FilePanel
          file={file}
          fallow={fallow}
          hops={traceHops(props.trace, props.hovered)}
        />
      )}
    </div>
  )
}
