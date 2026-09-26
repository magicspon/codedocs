import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, type JSX, type Ref, type RefObject } from 'react'
import type { Group, Points, ShaderMaterial } from 'three'
import type { PointCloud } from '../lib/point-cloud.ts'
import type { Threads } from '../lib/threads.ts'

/** The galaxy's building blocks: its clouds, its threads, its turn and its tags. */

/** A point cloud; a hit's index is the point, which for cores is the file. */
export function Cloud(props: {
  cloud: PointCloud
  /** Held by a cloud whose points a gather moves. */
  ref?: Ref<Points | null>
  material: ShaderMaterial
  onHover?: (index: number | null) => void
  onPick?: (index: number) => void
}): JSX.Element {
  const { cloud, onHover, onPick } = props
  return (
    <points
      ref={props.ref}
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

/** Line segments that fade in and out with the timeline. */
export function Lines(props: {
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
 * A slow turn: fast enough to read depth, slow enough to stay calm. It stops
 * under a pick, or the star would drift out from under the camera.
 */
export function useSpin(
  group: RefObject<Group | null>,
  turning: boolean,
): void {
  useFrame((_, delta) => {
    if (group.current && turning) group.current.rotation.y += delta * 0.02
  })
}

/** Pixels per unit of point size at unit distance, before any spread. */
const DOTS = 300
/** How much larger points are drawn while flying: near their true size, so close stars do not swamp their planets. */
const FLY_DOTS = 2

/**
 * Draws the galaxy's points `spread` times larger from afar, matching how far
 * its stars were spread apart, so the overview looks as dense as ever. In
 * flight it eases them back towards their true size.
 */
export function useDotScale(
  materials: readonly ShaderMaterial[],
  flying: boolean,
  spread: number,
): void {
  const now = useRef(spread)
  useFrame((_, delta) => {
    const target = flying ? Math.min(FLY_DOTS, spread) : spread
    now.current += (target - now.current) * Math.min(1, delta * 2)
    for (const m of materials) m.uniforms.uScale!.value = DOTS * now.current
  })
}

/** A tag on the star the path keys point at, so the walk can be seen in the sky. */
export function Aim(props: {
  at: readonly [number, number, number]
  path: string
}): JSX.Element {
  return (
    <Html
      position={props.at as [number, number, number]}
      center
      zIndexRange={[15, 5]}
      style={{ pointerEvents: 'none' }}
    >
      <span className="trace-label aim">
        {props.path.slice(props.path.lastIndexOf('/') + 1)}
      </span>
    </Html>
  )
}
