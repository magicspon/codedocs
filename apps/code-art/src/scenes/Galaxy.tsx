import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, type JSX } from 'react'
import type { Group, ShaderMaterial } from 'three'
import { galaxyLayout, type PointCloud } from '../lib/galaxy-layout.ts'
import { glowMaterial, lifeLineMaterial } from '../lib/glow.ts'
import { visibility } from '../lib/series.ts'
import type { SceneProps } from './scene.ts'

function Cloud(props: {
  cloud: PointCloud
  material: ShaderMaterial
  onHover?: (index: number | null) => void
}): JSX.Element {
  const { cloud, onHover } = props
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
      </bufferGeometry>
    </points>
  )
}

/**
 * The codebase as a spiral galaxy: arms are top-level directories, the core is
 * the code everything else leans on, stars are symbols, red haze is blind spots.
 * Over a timeline, stars ignite as their file gains symbols.
 */
export function Galaxy({ series, playhead, onHover }: SceneProps): JSX.Element {
  const layout = useMemo(() => galaxyLayout(series), [series])
  const materials = useMemo(
    () => ({
      nebulae: glowMaterial(),
      stars: glowMaterial(),
      cores: glowMaterial(),
      links: lifeLineMaterial(),
    }),
    [],
  )
  const group = useRef<Group>(null)

  useFrame((_, delta) => {
    // A slow turn: fast enough to read depth, slow enough to stay calm.
    if (group.current) group.current.rotation.y += delta * 0.02
    for (const m of Object.values(materials))
      m.uniforms.uTime!.value = playhead.t
  })

  // A file not yet written at this point in history is still in the buffer; it must not answer hover.
  const hover = (file: number | null): void =>
    onHover(
      file !== null && visibility(series.fileLife[file]!, playhead.t) > 0.5
        ? file
        : null,
    )

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
        <lineSegments material={materials.links}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[layout.links.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[layout.links.colors, 3]}
            />
            <bufferAttribute
              attach="attributes-birth"
              args={[layout.links.births, 1]}
            />
            <bufferAttribute
              attach="attributes-death"
              args={[layout.links.deaths, 1]}
            />
          </bufferGeometry>
        </lineSegments>
        <Cloud cloud={layout.stars} material={materials.stars} />
        <Cloud
          cloud={layout.cores}
          material={materials.cores}
          onHover={hover}
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
