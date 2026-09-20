import { useMemo, useState, type JSX } from 'react'
import { initial, initialDataset, useBookmark, useSeries } from './hooks.ts'
import { DATASETS } from './lib/load.ts'
import type { Playhead } from './lib/series.ts'
import { Hud } from './Hud.tsx'
import { SCENES, Stage } from './Stage.tsx'
import { TimelineBar } from './TimelineBar.tsx'

/** The viewer: one dataset, one scene, and the file under the pointer. */
export function App(): JSX.Element {
  const [dataset, setDataset] = useState(initialDataset)
  const [scene, setScene] = useState(() => initial('scene', 'galaxy'))
  const [lens, setLens] = useState(() => initial('lens', '') === 'health')
  const [frame, setFrame] = useState(0)
  const { series, hovered, setHovered } = useSeries(dataset, scene)
  useBookmark(dataset, scene, lens)

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
