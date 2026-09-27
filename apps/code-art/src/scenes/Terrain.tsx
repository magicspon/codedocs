import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
} from 'three'
import { glowMaterial } from '../lib/glow.ts'
import { ownerAt } from '../lib/terrain-field.ts'
import { TERRAIN_RADIUS, terrainLayout } from '../lib/terrain-layout.ts'
import type { SceneProps } from './scene.ts'
import {
  skirtMaterial,
  surfaceMaterial,
  waterMaterial,
} from './terrain-material.ts'

/** Beacon masts: amber, like the light that leaves a file in a trace. */
const MAST = '#ffc56b'

/**
 * The codebase as a landscape, drawn in lines of light. The repository root
 * sits at the centre, and each top-level folder fans out from it as a range of
 * its own colour. Every file raises a peak as tall as its symbol count; test
 * files sink small lakes. Calls run as rivers along the folder tree, joining
 * into trunks where folders lean on each other, and beacons stand over the
 * files the rest of the code calls most. An art piece: it names the file
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
      skirt: skirtMaterial(TERRAIN_RADIUS, cell),
      water: waterMaterial(TERRAIN_RADIUS),
      tips: glowMaterial(),
      masts: new LineBasicMaterial({
        color: MAST,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      root: new LineBasicMaterial({ color: '#e8f6ff' }),
    }),
    [field.peak, cell],
  )
  useEffect(() => {
    // Beacon lights are drawn big: there are few of them, and they mark hubs.
    materials.tips.uniforms.uScale!.value = 2400
    return () => {
      for (const m of Object.values(materials)) m.dispose()
    }
  }, [materials])
  const clocked = useMemo(
    () => [materials.surface, materials.skirt, materials.water],
    [materials],
  )
  const tipColors = useMemo(() => {
    const out = new Float32Array(layout.beacons.sizes.length * 3)
    for (let n = 0; n < layout.beacons.sizes.length; n++)
      out.set([1, 0.82, 0.5], n * 3)
    return out
  }, [layout])
  // Beacons live for the whole view; the glow material fades by life.
  const lives = useMemo(() => {
    const n = layout.beacons.sizes.length
    return {
      births: new Float32Array(n),
      deaths: new Float32Array(n).fill(1e9),
    }
  }, [layout])
  const monolith = useMemo(() => {
    const s = TERRAIN_RADIUS * 0.035
    const box = new BoxGeometry(s, s * 1.6, s)
    const edges = new EdgesGeometry(box)
    box.dispose()
    return edges
  }, [])
  useEffect(() => () => monolith.dispose(), [monolith])

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

  const { surface, skirt, water, beacons, root } = layout
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
      <mesh
        material={materials.surface}
        onPointerMove={move}
        onPointerOut={() => hover(null)}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[surface.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[surface.colors, 3]}
          />
          <bufferAttribute attach="attributes-wet" args={[surface.wet, 1]} />
          <bufferAttribute attach="index" args={[surface.index, 1]} />
        </bufferGeometry>
      </mesh>
      <mesh material={materials.skirt}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[skirt.positions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[skirt.colors, 3]} />
          <bufferAttribute attach="attributes-drop" args={[skirt.drop, 1]} />
          <bufferAttribute attach="attributes-along" args={[skirt.along, 1]} />
          <bufferAttribute attach="index" args={[skirt.index, 1]} />
        </bufferGeometry>
      </mesh>
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
      <lineSegments material={materials.masts}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[beacons.masts, 3]}
          />
        </bufferGeometry>
      </lineSegments>
      <points material={materials.tips}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[beacons.tips, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[tipColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[beacons.sizes, 1]} />
          <bufferAttribute attach="attributes-birth" args={[lives.births, 1]} />
          <bufferAttribute attach="attributes-death" args={[lives.deaths, 1]} />
        </bufferGeometry>
      </points>
      {/* The root, where every river meets: a small bright block, as in a mycelium's seed. */}
      <lineSegments
        geometry={monolith}
        material={materials.root}
        position={[root[0], root[1] + TERRAIN_RADIUS * 0.03, root[2]]}
      />
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate
        autoRotateSpeed={0.25}
        target={[0, 0, 0]}
        minDistance={TERRAIN_RADIUS * 0.3}
        maxDistance={TERRAIN_RADIUS * 4}
        maxPolarAngle={Math.PI * 0.46}
      />
    </>
  )
}
