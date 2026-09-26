import { useEffect, useState, type JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import { hoveredFile } from './lib/frame.ts'
import type { Series } from './lib/series.ts'
import { traceHops } from './lib/trace-text.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { FilePanel } from './FilePanel.tsx'
import { IconToggle, InfoIcon, RocketIcon } from './icons.tsx'
import { FollowSwitch } from './FollowSwitch.tsx'
import { PathsPanel } from './PathsPanel.tsx'
import { SearchCorner } from './SearchCorner.tsx'
import type { PathNav } from './usePathKeys.ts'

/** The flying keys, grouped by what they do, as the key caps show them. */
const FLIGHT_KEYS: readonly (readonly [
  keys: readonly string[],
  does: string,
])[] = [
  [['W', 'S'], 'thrust'],
  [['A', 'D'], 'turn'],
  [['Q', 'E'], 'dive · climb'],
  [['⇧'], 'boost'],
]

/**
 * How the galaxy traces: both ways, six hops. Six is where most call traces
 * stop finding new files, and one loop of the light still lasts about 15s.
 */
const TRACE = { direction: 'both', depth: 6 } as const

interface GalaxyHudProps {
  /** Whether the camera rides the spacecraft. */
  readonly fly: boolean
  readonly onFly: (on: boolean) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the selected file's facts come from. */
  readonly frame: number
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
  readonly nav: PathNav
}

/** The key caps shown while flying. */
function FlightKeys(): JSX.Element {
  return (
    <ul className="flight-keys" aria-label="Flying keys">
      {FLIGHT_KEYS.map(([keys, does]) => (
        <li key={does}>
          {keys.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
          <span>{does}</span>
        </li>
      ))}
    </ul>
  )
}

/** The rocket, and the flying keys beside it while in flight. */
function Dock(props: {
  fly: boolean
  onFly: (on: boolean) => void
}): JSX.Element {
  return (
    <div className="dock">
      <IconToggle
        open={props.fly}
        onToggle={props.onFly}
        labels={['Take off (F)', 'Land (F)']}
      >
        <RocketIcon />
      </IconToggle>
      {props.fly && <FlightKeys />}
    </div>
  )
}

/** The selected file's details, its system's keys and its links. */
function FileInfo(props: GalaxyHudProps & { file: FileDatum }): JSX.Element {
  const { series, nav } = props
  return (
    <div id="file-info" className="corner-panels">
      <FilePanel
        file={props.file}
        fallow={series?.merged.fallow}
        hops={traceHops(props.trace, nav.selected)}
      />
      <div className="panel">
        <p className="legend system-keys">
          Shift ←→ choose a planet · Enter or Shift ↓ zoom in · Esc or Shift ↑
          zoom out
        </p>
      </div>
      {series && (
        <PathsPanel
          nav={nav}
          via={props.query.via}
          files={series.merged.files}
          onPick={nav.follow}
        />
      )}
    </div>
  )
}

/**
 * The galaxy's overlay: nothing but a rocket until asked. The rocket (or F)
 * takes off and shows the flying keys; the magnifier (or /) opens the
 * search; the bottom-left pair picks calls or imports to follow; picking a file adds an info button that opens its details.
 */
export function GalaxyHud(props: GalaxyHudProps): JSX.Element {
  // Held here so it stays open across files until closed.
  const [info, setInfo] = useState(false)
  // The galaxy offers no trace settings, so any left over from the address
  // or the city are put back to its own.
  const { query, onQuery } = props
  useEffect(() => {
    if (query.direction !== TRACE.direction || query.depth !== TRACE.depth)
      onQuery({ ...query, ...TRACE })
  }, [query, onQuery])
  const file = hoveredFile(props.series, props.frame, props.nav.selected)
  return (
    <>
      <Dock fly={props.fly} onFly={props.onFly} />
      <FollowSwitch
        via={props.query.via}
        onVia={(via) => props.onQuery({ ...props.query, via })}
      />
      {props.series && (
        <SearchCorner
          query={props.query}
          onQuery={props.onQuery}
          trace={props.trace}
          files={props.series.merged.files}
        />
      )}
      {file && (
        <div className="corner">
          <IconToggle
            open={info}
            onToggle={setInfo}
            labels={['Show file details', 'Hide file details']}
            controls="file-info"
          >
            <InfoIcon />
          </IconToggle>
          {info && <FileInfo {...props} file={file} />}
        </div>
      )}
    </>
  )
}
