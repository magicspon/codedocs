import type { JSX } from 'react'
import type { Series } from './lib/series.ts'
import { FilePanel } from './FilePanel.tsx'

/** What each scene maps, in one line, so the picture can be read and not just looked at. */
const LEGENDS: Record<string, string> = {
  galaxy:
    'Arms are top-level folders. The core holds the code everything else leans on. Stars are symbols, coloured by kind. Red haze marks calls the analysis could not resolve.',
  city: 'Districts are folders. Footprint is file size, height is symbol count. Grey is source, teal is test, amber is config, violet is generated. Beacons glow with incoming calls.',
}

interface HudProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (name: string) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the hovered file's facts come from. */
  readonly frame: number
  readonly hovered: number | null
}

/** The overlay: pickers, a legend, and the file under the pointer. */
export function Hud(props: HudProps): JSX.Element {
  const { series, hovered } = props
  const row = series?.at[Math.min(props.frame, series.at.length - 1)]
  const file = hovered !== null ? (row?.[hovered] ?? undefined) : undefined
  const present = row?.filter(Boolean).length ?? 0
  const commit =
    series?.commits[Math.min(props.frame, series.commits.length - 1)]

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

  return (
    <div className="hud">
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
        {series ? (
          <p className="meta">
            {present.toLocaleString()} files · {commit?.sha.slice(0, 7)}
          </p>
        ) : (
          <p className="meta">Loading…</p>
        )}
        <p className="legend">{LEGENDS[props.scene]}</p>
      </div>
      {file && <FilePanel file={file} />}
    </div>
  )
}
