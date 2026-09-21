import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { Group, ShaderMaterial } from 'three'
import { galaxyLayout, type PointCloud } from '../lib/galaxy-layout.ts'
import {
  glowMaterial,
  healthGlowMaterial,
  lifeLineMaterial,
} from '../lib/glow.ts'
import { healthTexture } from '../lib/health-texture.ts'
import { visibility } from '../lib/series.ts'
import type { Threads } from '../lib/threads.ts'
import { useFocus } from './focus.ts'
import { useLens } from './lens.ts'
import type { SceneProps } from './scene.ts'
import { TraceFlow } from './TraceFlow.tsx'

function Cloud(props: {
  cloud: PointCloud
  material: ShaderMaterial
  onHover?: (index: number | null) => void
  onPick?: (index: number) => void
}): JSX.Element {
  const { cloud, onHover, onPick } = props
  return (
    <points
      material={props.material}
      onPointerMove={
        onHover &&
        ((e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          onHover(e.index ?? null)
        ))
      }
      onPointerOut={onHover && (() => onHover(null))}
      onClick={
        onPick &&
        ((e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.index !== undefined) onPick(e.index)
        })
      }
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[cloud.positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[cloud.colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[cloud.sizes, 1]} />
        <bufferAttribute attach="attributes-birth" args={[cloud.births, 1]} />
        <bufferAttribute attach="attributes-death" args={[cloud.deaths, 1]} />
        <bufferAttribute attach="attributes-file" args={[cloud.files, 1]} />
      </bufferGeometry>
    </points>
  )
}

function Lines(props: {
  threads: Threads
  material: ShaderMaterial
}): JSX.Element {
  const { threads } = props
  return (
    <lineSegments material={props.material}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[threads.positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[threads.colors, 3]} />
        <bufferAttribute attach="attributes-birth" args={[threads.births, 1]} />
        <bufferAttribute attach="attributes-death" args={[threads.deaths, 1]} />
      </bufferGeometry>
    </lineSegments>
  )
}

/**
 * The codebase as a spiral galaxy: arms are top-level directories, the core is
 * the code everything else leans on, stars are symbols, red haze is blind spots.
 * Over a timeline, stars ignite as their file gains symbols. Under the health
 * lens, hotspots flare (pulsing when heating up, dull red when cooling),
 * unused files grey out and copies pair up. Under a search, the rest of the
 * sky dims and light runs the calls through the files that matched.
 */
export function Galaxy(props: SceneProps): JSX.Element {
  const { series, playhead, onHover } = props
  const layout = useMemo(() => galaxyLayout(series), [series])
  const health = useMemo(
    () => healthTexture(layout.health, series.merged.files.length),
    [layout, series],
  )
  const materials = useMemo(
    () => ({
      nebulae: glowMaterial(),
      // A hot file's core blazes; its stars only warm, or the arm would drown.
      stars: healthGlowMaterial(0.25),
      cores: healthGlowMaterial(1),
      links: lifeLineMaterial(),
      clones: lifeLineMaterial(),
    }),
    [],
  )
  useEffect(() => {
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uHealth!.value = health.texture
      m.uniforms.uHealthRows!.value = health.texture.image.height
    }
    return () => health.texture.dispose()
  }, [health, materials])
  const lens = useLens(props.lens)
  const focus = useFocus(props.trace, series.merged.files.length)
  useEffect(() => {
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uFocusMap!.value = focus.texture
      m.uniforms.uFocusRows!.value = focus.texture.image.height
    }
  }, [focus.texture, materials])
  const shape = useMemo(
    () => ({
      anchors: Array.from({ length: series.merged.files.length }, (_, i) => {
        const p = layout.cores.positions
        return [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!] as const
      }),
      bow: 0.22,
      size: 0.55,
      lives: series.fileLife,
    }),
    [layout, series],
  )
  const group = useRef<Group>(null)

  useFrame((state, delta) => {
    // A slow turn: fast enough to read depth, slow enough to stay calm.
    if (group.current) group.current.rotation.y += delta * 0.02
    for (const m of Object.values(materials))
      m.uniforms.uTime!.value = playhead.t
    health.follow(playhead.t, lens.current)
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uLens!.value = lens.current
      m.uniforms.uClock!.value = state.clock.elapsedTime
      m.uniforms.uFocus!.value = focus.mix.current
    }
    // A search quiets everything but itself: its own arcs carry the calls.
    const quiet = 1 - focus.mix.current * 0.88
    materials.clones.uniforms.uOpacity!.value = lens.current * quiet
    materials.links.uniforms.uOpacity!.value = quiet
    materials.nebulae.uniforms.uDim!.value = quiet
  })

  // A file not yet written at this point in history is still in the buffer; it must not answer the pointer.
  const present = (file: number): boolean =>
    visibility(series.fileLife[file]!, playhead.t) > 0.5
  const hover = (file: number | null): void =>
    onHover(file !== null && present(file) ? file : null)

  return (
    <>
      <color attach="background" args={['#020208']} />
      <PerspectiveCamera
        makeDefault
        position={[0, layout.radius * 0.9, layout.radius * 1.5]}
        fov={55}
        far={layout.radius * 20}
      />
      <group ref={group}>
        <Cloud cloud={layout.nebulae} material={materials.nebulae} />
        <Lines threads={layout.links} material={materials.links} />
        <Lines threads={layout.clones} material={materials.clones} />
        <Cloud cloud={layout.stars} material={materials.stars} />
        <Cloud
          cloud={layout.cores}
          material={materials.cores}
          onHover={hover}
          onPick={(file) => present(file) && props.onPick(file)}
        />
        <TraceFlow
          trace={props.trace}
          shape={shape}
          files={series.merged.files}
          playhead={playhead}
          focus={focus.mix}
          scale={300}
        />
      </group>
      <OrbitControls
        makeDefault
        enableDamping
        maxDistance={layout.radius * 4}
      />
    </>
  )
}
