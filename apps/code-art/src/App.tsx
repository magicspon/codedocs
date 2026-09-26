import { useHotkey } from '@tanstack/react-hotkeys'
import { getRouteApi } from '@tanstack/react-router'
import { useDeferredValue, useMemo, useState, type JSX } from 'react'
import { useBookmark, useHover } from './hooks.ts'
import { isolatedFiles } from './lib/isolate.ts'
import { DATASETS } from './lib/load.ts'
import type { Playhead } from './lib/series.ts'
import { NO_CLAIMS, type SystemClaims } from './lib/system-nav.ts'
import { keyFrames } from './lib/time-warp.ts'
import { traceOf, type TraceQuery } from './lib/trace.ts'
import { queryOf } from './search.ts'
import { GalaxyHud } from './GalaxyHud.tsx'
import { Hud } from './Hud.tsx'
import { Loader } from './Loader.tsx'
import { SCENES, Stage } from './Stage.tsx'
import { toggleTracks } from './scenes/tracks.ts'
import { TimelineBar } from './TimelineBar.tsx'
import { usePathKeys } from './usePathKeys.ts'

const route = getRouteApi('/$dataset')

/**
 * The viewer: one dataset, one scene, the file under the pointer, and a search
 * traced through it. The route names and loads the dataset; the rest of the
 * view starts from the URL's search and is kept there as it changes.
 */
export function App(): JSX.Element {
  const { dataset } = route.useParams()
  const series = route.useLoaderData()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const setDataset = (name: string): void =>
    void navigate({
      to: '/$dataset',
      params: { dataset: name },
      search: (s) => s,
    })
  // A bookmark can name a scene that is gone, such as the archived city.
  const [scene, setScene] = useState(() =>
    search.scene && search.scene in SCENES ? search.scene : 'galaxy',
  )
  const [lens, setLens] = useState(search.lens === 'health')
  const [isolate, setIsolate] = useState(search.isolate === 'on')
  useHotkey('I', () => setIsolate((on) => !on))
  useHotkey('O', toggleTracks)
  // Taking off is for the galaxy only, and never outlives it.
  const [fly, setFly] = useState(false)
  const flying = fly && scene === 'galaxy'
  useHotkey('F', () => setFly((on) => !on), { enabled: scene === 'galaxy' })
  const [frame, setFrame] = useState(0)
  const [query, setQuery] = useState<TraceQuery>(() => queryOf(search))
  // The view whose first frame has drawn, and whose hover is current.
  const view = `${dataset}/${scene}`
  const { hovered, setHovered } = useHover(view)
  useBookmark({ scene, lens, isolate, query })
  // Deferred so typing stays quick while a big repository re-traces behind it.
  const searched = useDeferredValue(query)
  const trace = useMemo(() => traceOf(series, searched), [series, searched])
  // Only the galaxy isolates; there, time closes up round the isolated files too.
  const isolating = isolate && scene === 'galaxy' && trace !== null
  const keys = useMemo(
    () => (isolating ? keyFrames(series, isolatedFiles(trace)) : null),
    [isolating, series, trace],
  )
  const pick = (file: number): void => {
    const path = series.merged.files[file]?.path
    if (path) setQuery((q) => ({ ...q, text: path }))
  }
  // Enter and Escape, when the picked file's system is using them.
  const [claims, setClaims] = useState<SystemClaims>(NO_CLAIMS)
  const nav = usePathKeys(series, frame, query, trace, setQuery, claims)

  // One playhead per loaded series. A history starts at its first commit so it
  // can be watched growing; a single index sits at its only frame.
  const playhead = useMemo<Playhead>(() => ({ t: 0 }), [series, scene])
  // The galaxy keeps its own bare overlay.
  const bare = scene === 'galaxy'
  // Keyed like the canvas, so a new dataset or scene shows the spinner again
  // until it too has drawn.
  const [drawn, setDrawn] = useState<string | null>(null)
  const loading = drawn !== view

  return (
    <>
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
        onReady={() => setDrawn(view)}
      />
      {loading && <Loader />}
      {bare ? (
        <GalaxyHud
          fly={flying}
          onFly={setFly}
          series={series}
          frame={frame}
          query={query}
          onQuery={setQuery}
          trace={trace}
          nav={nav}
        />
      ) : (
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
      )}
      {series.commits.length > 1 && (
        <TimelineBar
          key={`timeline:${dataset}/${scene}`}
          series={series}
          playhead={playhead}
          onFrame={setFrame}
          keys={keys}
          hidden={bare}
        />
      )}
    </>
  )
}
