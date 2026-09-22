import { useState, type JSX } from 'react'
import { detailFile, hoveredFile } from './lib/frame.ts'
import type { Series } from './lib/series.ts'
import { traceHops } from './lib/trace-text.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { Controls } from './Controls.tsx'
import { FilePanel } from './FilePanel.tsx'
import { PathsPanel } from './PathsPanel.tsx'
import type { PathNav } from './usePathKeys.ts'

interface HudProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (name: string) => void
  readonly lens: boolean
  readonly onLens: (on: boolean) => void
  readonly isolate: boolean
  readonly onIsolate: (on: boolean) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the hovered file's facts come from. */
  readonly frame: number
  readonly hovered: number | null
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
  readonly nav: PathNav
}

/** The overlay: the controls (pickers, legend, search) and the file under the pointer. */
export function Hud(props: HudProps): JSX.Element {
  // Held here, not in the panel, so it stays shut across files until reopened.
  const [collapsed, setCollapsed] = useState(false)
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
  const shown = detailFile(props.hovered, props.trace?.matches)
  const file = hoveredFile(props.series, props.frame, shown)
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
          isolate={props.isolate}
          onIsolate={props.onIsolate}
          fallow={fallow}
          series={props.series}
          frame={props.frame}
          query={props.query}
          onQuery={props.onQuery}
          trace={props.trace}
        />
      </div>
      <div className="column">
        {file && (
          <FilePanel
            file={file}
            fallow={fallow}
            hops={traceHops(props.trace, shown)}
            collapsed={collapsed}
            onCollapse={setCollapsed}
          />
        )}
        {/* Only the galaxy draws a picked file as a system to walk. */}
        {props.scene === 'galaxy' && props.nav.selected !== null && (
          <div className="panel">
            <p className="legend system-keys">
              Shift ←→ choose a planet · Enter or Shift ↓ zoom in · Esc or Shift
              ↑ zoom out
            </p>
          </div>
        )}
        {props.series && (
          <PathsPanel
            nav={props.nav}
            via={props.query.via}
            files={props.series.merged.files}
            onPick={props.nav.follow}
          />
        )}
      </div>
    </div>
  )
}
