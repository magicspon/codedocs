import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { ShaderMaterial, Vector3 } from 'three'
import { ownerAt } from '../lib/terrain-field.ts'
import type { Apron } from '../lib/terrain-apron.ts'
import { TERRAIN_RADIUS, terrainLayout } from '../lib/terrain-layout.ts'
import type { SceneProps } from './scene.ts'
import { surfaceMaterial, waterMaterial } from './terrain-material.ts'

/**
 * The codebase as a landscape, drawn in lines of light. The repository root
 * sits at the centre, and each top-level folder fans out from it as a range of
 * its own colour. Every file raises a peak as tall as its symbol count; test
 * files sink small lakes. Calls run as rivers along the folder tree, joining
 * into trunks where folders lean on each other, and amber ripples close in on
 * the files the rest of the code calls most. Each peak is banded by its mix
 * of symbol kinds. An art piece: it names the file
 * under the pointer, and draws the latest state of a timeline.
 */
export function Terrain(props: SceneProps): JSX.Element {
  const { series, onHover } = props
  const layout = useMemo(() => terrainLayout(series), [series])
  const { field } = layout
  const cell = (field.extent * 2) / (field.size - 1)
  const materials = useMemo(
    () => ({
      surface: surfaceMaterial(TERRAIN_RADIUS, field.peak, cell),
      water: waterMaterial(TERRAIN_RADIUS),
    }),
    [field.peak, cell],
  )
  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose()
    },
    [materials],
  )
  // The hubs the ripples close in on.
  useEffect(() => {
    const u = materials.surface.uniforms
    const { spots } = layout.hubs
    const hubs = u.uHubs!.value as Vector3[]
    for (let n = 0; n * 3 < spots.length; n++)
      hubs[n]!.set(spots[n * 3]!, spots[n * 3 + 1]!, spots[n * 3 + 2]!)
    u.uHubCount!.value = spots.length / 3
  }, [materials, layout])
  const clocked = useMemo(
    () => [materials.surface, materials.water],
    [materials],
  )

  const hovered = useRef<number | null>(null)
  useFrame((state) => {
    for (const m of clocked) m.uniforms.uClock!.value = state.clock.elapsedTime
  })
  const hover = (file: number | null): void => {
    if (file === hovered.current) return
    hovered.current = file
    const u = materials.surface.uniforms
    u.uHoverOn!.value = file === null ? 0 : 1
    if (file !== null) {
      const node = layout.tree.nodes[layout.tree.fileNode[file]!]!
      u.uHover!.value.set(node.x, 0, node.z)
    }
    onHover(file)
  }
  const move = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    const file = ownerAt(field, e.point.x, e.point.z)
    hover(file === -1 ? null : file)
  }

  const { surface, apron, water, strata } = layout
  return (
    <>
      <color attach="background" args={['#010105']} />
      <PerspectiveCamera
        makeDefault
        position={[0, TERRAIN_RADIUS * 0.9, TERRAIN_RADIUS * 1.25]}
        fov={45}
        near={0.1}
        far={TERRAIN_RADIUS * 12}
      />
      <Ground
        buffers={{
          ...surface,
          strataLow: strata.lower,
          strataHigh: strata.upper,
          rise: strata.rise,
        }}
        material={materials.surface}
        onPointerMove={move}
        onPointerOut={() => hover(null)}
      />
      <Ground buffers={apron} material={materials.surface} />
      <lineSegments material={materials.water}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[water.positions, 3]}
          />
          <bufferAttribute attach="attributes-along" args={[water.along, 1]} />
          <bufferAttribute attach="attributes-flow" args={[water.flow, 1]} />
        </bufferGeometry>
      </lineSegments>
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate
        autoRotateSpeed={0.25}
        target={[0, 0, 0]}
        // Panning would slide the terrain off-centre; the zoom stops a little
        // beyond the opening view, so the terrain never shrinks to a speck.
        enablePan={false}
        minDistance={TERRAIN_RADIUS * 0.35}
        maxDistance={TERRAIN_RADIUS * 1.75}
        maxPolarAngle={Math.PI * 0.46}
      />
    </>
  )
}

/**
 * A stretch of ground in the surface shader: the terrain itself, or the open
 * ground round it. Both carry the same attributes, so the grid runs across.
 */
function Ground(props: {
  buffers: Apron
  material: ShaderMaterial
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: () => void
}): JSX.Element {
  const { buffers: b, material, onPointerMove, onPointerOut } = props
  return (
    <mesh
      material={material}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[b.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[b.colors, 3]} />
        <bufferAttribute attach="attributes-wet" args={[b.wet, 1]} />
        <bufferAttribute
          attach="attributes-strataLow"
          args={[b.strataLow, 4]}
        />
        <bufferAttribute
          attach="attributes-strataHigh"
          args={[b.strataHigh, 4]}
        />
        <bufferAttribute attach="attributes-rise" args={[b.rise, 1]} />
        <bufferAttribute attach="index" args={[b.index, 1]} />
      </bufferGeometry>
    </mesh>
  )
}
