import { useHotkey } from '@tanstack/react-hotkeys'
import { useDeferredValue, useMemo, useState, type JSX } from 'react'
import {
  initial,
  initialDataset,
  initialQuery,
  useBookmark,
  useSeries,
} from './hooks.ts'
import { isolatedFiles } from './lib/isolate.ts'
import { DATASETS } from './lib/load.ts'
import type { Playhead } from './lib/series.ts'
import { NO_CLAIMS, type SystemClaims } from './lib/system-nav.ts'
import { keyFrames } from './lib/time-warp.ts'
import { traceOf, type TraceQuery } from './lib/trace.ts'
import { Hud } from './Hud.tsx'
import { SCENES, Stage } from './Stage.tsx'
import { TimelineBar } from './TimelineBar.tsx'
import { usePathKeys } from './usePathKeys.ts'

/** The viewer: one dataset, one scene, the file under the pointer, and a search traced through it. */
export function App(): JSX.Element {
  const [dataset, setDataset] = useState(initialDataset)
  const [scene, setScene] = useState(() => initial('scene', 'galaxy'))
  const [lens, setLens] = useState(() => initial('lens', '') === 'health')
  const [isolate, setIsolate] = useState(() => initial('isolate', '') === 'on')
  useHotkey('I', () => setIsolate((on) => !on))
  // Taking off is for the galaxy only, and never outlives it.
  const [fly, setFly] = useState(false)
  const flying = fly && scene === 'galaxy'
  useHotkey('F', () => setFly((on) => !on), { enabled: scene === 'galaxy' })
  const [frame, setFrame] = useState(0)
  const [query, setQuery] = useState<TraceQuery>(initialQuery)
  const { series, hovered, setHovered } = useSeries(dataset, scene)
  useBookmark(dataset, scene, lens, isolate, query.text)
  // Deferred so typing stays quick while a big repository re-traces behind it.
  const searched = useDeferredValue(query)
  const trace = useMemo(
    () => (series ? traceOf(series, searched) : null),
    [series, searched],
  )
  // Only the galaxy isolates; there, time closes up round the isolated files too.
  const isolating = isolate && scene === 'galaxy' && trace !== null
  const keys = useMemo(
    () =>
      isolating && series && trace
        ? keyFrames(series, isolatedFiles(trace))
        : null,
    [isolating, series, trace],
  )
  const pick = (file: number): void => {
    const path = series?.merged.files[file]?.path
    if (path) setQuery((q) => ({ ...q, text: path }))
  }
  // Enter and Escape, when the picked file's system is using them.
  const [claims, setClaims] = useState<SystemClaims>(NO_CLAIMS)
  const nav = usePathKeys(series, frame, query, trace, setQuery, claims)

  // One playhead per loaded series. A history starts at its first commit so it
  // can be watched growing; a single index sits at its only frame.
  const playhead = useMemo<Playhead>(() => ({ t: 0 }), [series, scene])

  return (
    <>
      {series && (
        <Stage
          dataset={dataset}
          scene={scene}
          series={series}
          playhead={playhead}
          lens={lens}
          isolate={isolate}
          onHover={setHovered}
          trace={trace}
          onPick={pick}
          aim={nav.aim}
          onClaims={setClaims}
          fly={flying}
        />
      )}
      <Hud
        datasets={DATASETS}
        dataset={dataset}
        onDataset={setDataset}
        scenes={Object.keys(SCENES)}
        scene={scene}
        onScene={setScene}
        lens={lens}
        onLens={setLens}
        isolate={isolate}
        onIsolate={setIsolate}
        fly={flying}
        onFly={setFly}
        series={series}
        frame={frame}
        hovered={hovered}
        query={query}
        onQuery={setQuery}
        trace={trace}
        nav={nav}
      />
      {series && series.commits.length > 1 && (
        <TimelineBar
          key={`timeline:${dataset}/${scene}`}
          series={series}
          playhead={playhead}
          onFrame={setFrame}
          keys={keys}
        />
      )}
    </>
  )
}
