import type { JSX } from 'react'
import { hoveredFile } from './lib/frame.ts'
import type { Series } from './lib/series.ts'
import { Controls } from './Controls.tsx'
import { FilePanel } from './FilePanel.tsx'

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
}

/** The overlay: pickers, a legend, and the file under the pointer. */
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
      {file && <FilePanel file={file} fallow={fallow} />}
    </div>
  )
}
