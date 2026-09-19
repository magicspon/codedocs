import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { DATASETS, loadSeries } from './lib/load.ts'
import type { Playhead, Series } from './lib/series.ts'
import { Hud } from './Hud.tsx'
import { City } from './scenes/City.tsx'
import { Galaxy } from './scenes/Galaxy.tsx'
import { Landscape } from './scenes/Landscape.tsx'
import type { SceneProps } from './scenes/scene.ts'
import { TimelineBar } from './TimelineBar.tsx'

/** Every scene, by the name the switcher shows. */
const SCENES: Record<string, (props: SceneProps) => JSX.Element> = {
  galaxy: Galaxy,
  city: City,
  landscape: Landscape,
}

/** Bloom strength per scene: the galaxy is all light, the landscape is daylight. */
const BLOOM: Record<string, number> = {
  galaxy: 1.1,
  city: 0.9,
  landscape: 0.25,
}

/** Reads `?data=…&scene=…` so a view can be bookmarked. */
function initial(key: string, fallback: string): string {
  return new URLSearchParams(location.search).get(key) ?? fallback
}

/** The viewer: one dataset, one scene, and the file under the pointer. */
export function App(): JSX.Element {
  const [dataset, setDataset] = useState(() =>
    initial('data', DATASETS[0] ?? ''),
  )
  const [scene, setScene] = useState(() => initial('scene', 'galaxy'))
  const [series, setSeries] = useState<Series | null>(null)
  const [frame, setFrame] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    if (!dataset) return
    let live = true
    setSeries(null)
    setHovered(null)
    void loadSeries(dataset).then((s) => live && setSeries(s))
    history.replaceState(
      null,
      '',
      `?data=${encodeURIComponent(dataset)}&scene=${scene}`,
    )
    return () => {
      live = false
    }
  }, [dataset, scene])

  const Scene = SCENES[scene] ?? Galaxy
  // One playhead per loaded series. A history starts at its first commit so it
  // can be watched growing; a single index sits at its only frame.
  const playhead = useMemo<Playhead>(() => ({ t: 0 }), [series, scene])

  return (
    <>
      {series && (
        <Canvas
          key={`${dataset}/${scene}`}
          dpr={[1, 2]}
          raycaster={{ params: { Points: { threshold: 0.4 } } as never }}
        >
          <Scene series={series} playhead={playhead} onHover={setHovered} />
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
