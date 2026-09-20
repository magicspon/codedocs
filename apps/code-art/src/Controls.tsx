import type { JSX } from 'react'
import type { FallowMeta } from './lib/atlas.ts'
import { frameSummary } from './lib/frame.ts'
import type { Series } from './lib/series.ts'
import { LensToggle } from './LensToggle.tsx'

/** What each scene maps, in one line, so the picture can be read and not just looked at. */
const LEGENDS: Record<string, string> = {
  galaxy:
    'Arms are top-level folders. The core holds the code everything else leans on. Stars are symbols, coloured by kind. Red haze marks calls the analysis could not resolve.',
  city: 'Districts are folders. Footprint is file size, height is symbol count, and each setback is another kind of symbol the file declares. Lit windows are the traffic through the file, tinted by the kind it mostly holds. Roof masts glow with incoming calls.',
}

interface ControlsProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (name: string) => void
  readonly lens: boolean
  readonly onLens: (on: boolean) => void
  readonly fallow: FallowMeta | undefined
  /** Null while loading, when there is nothing to say about the frame. */
  readonly series: Series | null
  readonly frame: number
}

/** The pickers, what is on show, and the legend for it. */
export function Controls(props: ControlsProps): JSX.Element {
  const summary = props.series && frameSummary(props.series, props.frame)
  return (
    <div className="panel controls">
      <select
        value={props.dataset}
        onChange={(e) => props.onDataset(e.target.value)}
        aria-label="Dataset"
      >
        {props.datasets.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <div className="tabs" role="tablist">
        {props.scenes.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={s === props.scene}
            onClick={() => props.onScene(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {summary ? (
        <p className="meta">
          {summary.present.toLocaleString()} files ·{' '}
          {summary.commit?.sha.slice(0, 7)}
        </p>
      ) : (
        <p className="meta">Loading…</p>
      )}
      <p className="legend">{LEGENDS[props.scene]}</p>
      <LensToggle
        scene={props.scene}
        fallow={props.fallow}
        on={props.lens}
        onChange={props.onLens}
      />
    </div>
  )
}
