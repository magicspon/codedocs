import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, type JSX } from 'react'
import type { Playhead, Series } from './lib/series.ts'
import type { SystemClaims } from './lib/system-nav.ts'
import type { Trace } from './lib/trace.ts'
import { Galaxy } from './scenes/Galaxy.tsx'
import type { SceneProps } from './scenes/scene.ts'

/** Every scene, by the name the switcher shows. */
export const SCENES: Record<string, (props: SceneProps) => JSX.Element> = {
  galaxy: Galaxy,
}

/** Bloom strength per scene: the galaxy is all light. */
const BLOOM: Record<string, number> = {
  galaxy: 1.1,
}

interface StageProps {
  /** With the scene, the canvas key: a new dataset is a new canvas. */
  readonly dataset: string
  readonly scene: string
  readonly series: Series
  readonly playhead: Playhead
  readonly lens: boolean
  readonly isolate: boolean
  readonly onHover: (index: number | null) => void
  readonly trace: Trace | null
  readonly onPick: (index: number) => void
  readonly aim: number | null
  readonly onClaims: (claims: SystemClaims) => void
  readonly fly: boolean
  /** Called once the first frame is drawn, so the page can drop its spinner. */
  readonly onReady: () => void
}

/** Calls `onReady` after the first frame: by then the scene has laid out. */
function FirstFrame({ onReady }: { onReady: () => void }): null {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    onReady()
  })
  return null
}

/** The canvas: one scene, under the bloom that scene wants. */
export function Stage(props: StageProps): JSX.Element {
  const Scene = SCENES[props.scene] ?? Galaxy
  // The lens stays chosen across datasets, but only draws where fallow ran.
  const healthy = props.series.merged.fallow !== undefined
  return (
    // The composer draws into its own buffer and smooths edges there, so the
    // canvas's own antialiasing would be wasted. Density is held to 1.5: bloom
    // runs over every pixel, and past that a retina screen costs far more
    // than it shows.
    <Canvas
      key={`${props.dataset}/${props.scene}`}
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
    >
      <Scene
        series={props.series}
        playhead={props.playhead}
        lens={props.lens && healthy}
        isolate={props.isolate}
        onHover={props.onHover}
        trace={props.trace}
        onPick={props.onPick}
        aim={props.aim}
        onClaims={props.onClaims}
        fly={props.fly}
      />
      <FirstFrame onReady={props.onReady} />
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={BLOOM[props.scene] ?? 1}
          luminanceThreshold={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
