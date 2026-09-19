import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, type JSX } from 'react'
import { AdditiveBlending, type BufferGeometry, type Mesh } from 'three'
import { fileAt, landscapeLayout } from '../lib/landscape-layout.ts'
import { visibility } from '../lib/series.ts'
import { elevationAt, paint } from '../lib/terrain.ts'
import type { SceneProps } from './scene.ts'

/**
 * The codebase as rolling land: hills are files, peaks are the code everything
 * calls, channels are the gaps between directories, lakes are blind spots.
 * Over a timeline, the land rises out of the sea as the code is written.
 */
export function Landscape({
  series,
  playhead,
  onHover,
}: SceneProps): JSX.Element {
  const layout = useMemo(() => landscapeLayout(series), [series])
  const geometry = useRef<BufferGeometry>(null)
  const water = useRef<Mesh>(null)
  const beams = useRef<(Mesh | null)[]>([])
  const drawn = useRef(Number.NaN)
  const { size, peak } = layout

  useFrame((state) => {
    // The sea breathes a little, so a still picture is still alive.
    if (water.current) {
      water.current.position.y =
        layout.waterLevel +
        Math.sin(state.clock.elapsedTime * 0.6) * peak * 0.004
    }
    const g = geometry.current
    if (!g || playhead.t === drawn.current) return
    drawn.current = playhead.t
    paint(layout.elevations, playhead.t, peak, layout.positions, layout.colors)
    g.attributes.position!.needsUpdate = true
    g.attributes.color!.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingSphere()
    layout.lighthouses.forEach((l, k) => {
      const beam = beams.current[k]
      if (!beam) return
      beam.position.y =
        elevationAt(layout.elevations, l.vertex, playhead.t) + peak * 0.6
      beam.scale.setScalar(
        Math.max(1e-4, visibility(series.fileLife[l.file]!, playhead.t)),
      )
    })
  })

  const hover = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    const file = fileAt(layout.rects, e.point.x, e.point.z)
    onHover(
      file !== null && visibility(series.fileLife[file]!, playhead.t) > 0.5
        ? file
        : null,
    )
  }

  return (
    <>
      <color attach="background" args={['#cfd9e6']} />
      <fog attach="fog" args={['#cfd9e6', size * 0.5, size * 1.6]} />
      <PerspectiveCamera
        makeDefault
        position={[size * 0.45, size * 0.35, size * 0.55]}
        fov={45}
        far={size * 8}
      />
      <hemisphereLight args={['#fff4e0', '#3a4a5a', 0.9]} />
      <directionalLight
        position={[-size, size * 0.6, size * 0.3]}
        intensity={2.2}
        color="#ffd9a8"
      />
      <mesh onPointerMove={hover} onPointerOut={() => onHover(null)}>
        <bufferGeometry ref={geometry}>
          <bufferAttribute
            attach="attributes-position"
            args={[layout.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[layout.colors, 3]}
          />
          <bufferAttribute attach="index" args={[layout.index, 1]} />
        </bufferGeometry>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <mesh ref={water} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[size * 6, size * 6]} />
        <meshStandardMaterial
          color="#2a6f8f"
          transparent
          opacity={0.72}
          roughness={0.15}
          metalness={0.2}
        />
      </mesh>
      {layout.lighthouses.map((l, k) => (
        <mesh
          key={l.file}
          ref={(mesh) => {
            beams.current[k] = mesh
          }}
          position={[l.x, 0, l.z]}
          onPointerMove={(e) => (e.stopPropagation(), onHover(l.file))}
        >
          <cylinderGeometry
            args={[peak * 0.003, peak * 0.008, peak * 1.2, 8, 1, true]}
          />
          <meshBasicMaterial
            color="#ffe6a8"
            transparent
            opacity={0.35}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate
        autoRotateSpeed={0.25}
        maxPolarAngle={Math.PI / 2.15}
        maxDistance={size * 2.5}
      />
    </>
  )
}
