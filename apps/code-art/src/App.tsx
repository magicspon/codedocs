import { useDeferredValue, useMemo, useState, type JSX } from 'react'
import {
  initial,
  initialDataset,
  initialQuery,
  useBookmark,
  useSeries,
} from './hooks.ts'
import { DATASETS } from './lib/load.ts'
import type { Playhead } from './lib/series.ts'
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
  const [frame, setFrame] = useState(0)
  const [query, setQuery] = useState<TraceQuery>(initialQuery)
  const { series, hovered, setHovered } = useSeries(dataset, scene)
  useBookmark(dataset, scene, lens, query.text)
  // Deferred so typing stays quick while a big repository re-traces behind it.
  const searched = useDeferredValue(query)
  const trace = useMemo(
    () => (series ? traceOf(series, searched) : null),
    [series, searched],
  )
  const pick = (file: number): void => {
    const path = series?.merged.files[file]?.path
    if (path) setQuery((q) => ({ ...q, text: path }))
  }
  const nav = usePathKeys(series, frame, query, trace, setQuery)

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
          onHover={setHovered}
          trace={trace}
          onPick={pick}
          aim={nav.aim}
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
        />
      )}
    </>
  )
}
