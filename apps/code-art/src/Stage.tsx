import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import type { JSX } from 'react'
import type { Playhead, Series } from './lib/series.ts'
import type { SystemClaims } from './lib/system-nav.ts'
import type { Trace } from './lib/trace.ts'
import { City } from './scenes/City.tsx'
import { Galaxy } from './scenes/Galaxy.tsx'
import type { SceneProps } from './scenes/scene.ts'

/** Every scene, by the name the switcher shows. */
export const SCENES: Record<string, (props: SceneProps) => JSX.Element> = {
  galaxy: Galaxy,
  city: City,
}

/** Bloom strength per scene: the galaxy is all light. */
const BLOOM: Record<string, number> = {
  galaxy: 1.1,
  city: 0.9,
}

interface StageProps {
  /** With the scene, the canvas key: a new dataset is a new canvas. */
  readonly dataset: string
  readonly scene: string
  readonly series: Series
  readonly playhead: Playhead
  readonly lens: boolean
  readonly onHover: (index: number | null) => void
  readonly trace: Trace | null
  readonly onPick: (index: number) => void
  readonly aim: number | null
  readonly onClaims: (claims: SystemClaims) => void
}

/** The canvas: one scene, under the bloom that scene wants. */
export function Stage(props: StageProps): JSX.Element {
  const Scene = SCENES[props.scene] ?? Galaxy
  // The lens stays chosen across datasets, but only draws where fallow ran.
  const healthy = props.series.merged.fallow !== undefined
  return (
    <Canvas
      key={`${props.dataset}/${props.scene}`}
      dpr={[1, 2]}
      raycaster={{ params: { Points: { threshold: 0.4 } } as never }}
    >
      <Scene
        series={props.series}
        playhead={props.playhead}
        lens={props.lens && healthy}
        onHover={props.onHover}
        trace={props.trace}
        onPick={props.onPick}
        aim={props.aim}
        onClaims={props.onClaims}
      />
      <EffectComposer>
        <Bloom
          intensity={BLOOM[props.scene] ?? 1}
          luminanceThreshold={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
