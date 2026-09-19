import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { DATASETS, loadSeries } from './lib/load.ts'
import type { Playhead, Series } from './lib/series.ts'
import { Hud } from './Hud.tsx'
import { City } from './scenes/City.tsx'
import { Galaxy } from './scenes/Galaxy.tsx'
import type { SceneProps } from './scenes/scene.ts'
import { TimelineBar } from './TimelineBar.tsx'

/** Every scene, by the name the switcher shows. */
const SCENES: Record<string, (props: SceneProps) => JSX.Element> = {
  galaxy: Galaxy,
  city: City,
}

/** Bloom strength per scene: the galaxy is all light. */
const BLOOM: Record<string, number> = {
  galaxy: 1.1,
  city: 0.9,
}

/** Reads `?data=…&scene=…&lens=health` so a view can be bookmarked. */
function initial(key: string, fallback: string): string {
  return new URLSearchParams(location.search).get(key) ?? fallback
}

/** The viewer: one dataset, one scene, and the file under the pointer. */
export function App(): JSX.Element {
  const [dataset, setDataset] = useState(() =>
    initial('data', DATASETS[0] ?? ''),
  )
  const [scene, setScene] = useState(() => initial('scene', 'galaxy'))
  const [lens, setLens] = useState(() => initial('lens', '') === 'health')
  const [series, setSeries] = useState<Series | null>(null)
  const [frame, setFrame] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    if (!dataset) return
    let live = true
    setSeries(null)
    setHovered(null)
    void loadSeries(dataset).then((s) => live && setSeries(s))
    return () => {
      live = false
    }
  }, [dataset, scene])

  useEffect(() => {
    if (!dataset) return
    const query = `?data=${encodeURIComponent(dataset)}&scene=${scene}`
    history.replaceState(null, '', lens ? `${query}&lens=health` : query)
  }, [dataset, scene, lens])

  const Scene = SCENES[scene] ?? Galaxy
  // One playhead per loaded series. A history starts at its first commit so it
  // can be watched growing; a single index sits at its only frame.
  const playhead = useMemo<Playhead>(() => ({ t: 0 }), [series, scene])
  // The lens stays chosen across datasets, but only draws where fallow ran.
  const healthy = series?.merged.fallow !== undefined

  return (
    <>
      {series && (
        <Canvas
          key={`${dataset}/${scene}`}
          dpr={[1, 2]}
          raycaster={{ params: { Points: { threshold: 0.4 } } as never }}
        >
          <Scene
            series={series}
            playhead={playhead}
            lens={lens && healthy}
            onHover={setHovered}
          />
          <EffectComposer>
            <Bloom
              intensity={BLOOM[scene] ?? 1}
              luminanceThreshold={0.35}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
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
