import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import { BufferAttribute, BufferGeometry, type Color, type Mesh } from 'three'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { tangents, type Vec3 } from '../lib/metro-sphere.ts'
import {
  beamMaterial,
  laneMaterial,
  skyMaterial,
} from './metro-air-material.ts'
import type { MetroUniforms } from './metro-glsl.ts'

/** How far a beam climbs past its roof, as a share of the planet's radius. */
const BEAM_REACH = 1.4
/** How wide a beam is at its foot. */
const BEAM_WIDTH = 3

/** Two crossed quads per beacon, rising from its roof. */
function beamsOf(layout: MetroLayout): BufferGeometry {
  const { spots, share } = layout.beacons
  const n = share.length
  const positions = new Float32Array(n * 2 * 4 * 3)
  const beam = new Float32Array(n * 2 * 4 * 2)
  const shares = new Float32Array(n * 2 * 4)
  const index: number[] = []
  const tall = layout.radius * BEAM_REACH
  for (let b = 0; b < n; b++) {
    const foot: Vec3 = [spots[b * 4]!, spots[b * 4 + 1]!, spots[b * 4 + 2]!]
    const l = Math.hypot(...foot)
    const up: Vec3 = [foot[0] / l, foot[1] / l, foot[2] / l]
    const roof = spots[b * 4 + 3]!
    tangents(up).forEach((side, q) => {
      const v = (b * 2 + q) * 4
      for (const [k, across, rise] of [
        [0, -1, 0],
        [1, 1, 0],
        [2, -1, 1],
        [3, 1, 1],
      ] as const) {
        const h = roof + rise * tall
        const w = (BEAM_WIDTH / 2) * across * (1 + rise * 2)
        for (let c = 0; c < 3; c++)
          positions[(v + k) * 3 + c] = foot[c]! + up[c]! * h + side[c]! * w
        beam.set([across, rise], (v + k) * 2)
        shares[v + k] = share[b]!
      }
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
    })
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('beam', new BufferAttribute(beam, 2))
  g.setAttribute('share', new BufferAttribute(shares, 1))
  g.setIndex(index)
  return g
}

/** The sky, the sky lanes and the beams. The sky dome rides with the camera, so it never comes closer. */
export function MetroAir(props: {
  layout: MetroLayout
  shared: MetroUniforms
  glow: Color
}): JSX.Element {
  const { layout, shared, glow } = props
  const materials = useMemo(
    () => ({
      sky: skyMaterial(shared, glow),
      lane: laneMaterial(shared),
      beam: beamMaterial(shared),
    }),
    [shared, glow],
  )
  const beams = useMemo(() => beamsOf(layout), [layout])
  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose()
      beams.dispose()
    },
    [materials, beams],
  )
  const sky = useRef<Mesh>(null)
  useFrame(({ camera }) => {
    sky.current?.position.copy(camera.position)
    ;(materials.sky.uniforms.uUp!.value as { copy(v: unknown): void }).copy(
      camera.up,
    )
  })
  const { lanes } = layout
  return (
    <>
      <mesh
        ref={sky}
        material={materials.sky}
        renderOrder={-1}
        frustumCulled={false}
      >
        <sphereGeometry args={[layout.radius * 5, 32, 16]} />
      </mesh>
      <lineSegments material={materials.lane} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[lanes.positions, 3]}
          />
          <bufferAttribute attach="attributes-along" args={[lanes.along, 1]} />
          <bufferAttribute
            attach="attributes-weight"
            args={[lanes.weight, 1]}
          />
        </bufferGeometry>
      </lineSegments>
      <mesh geometry={beams} material={materials.beam} frustumCulled={false} />
    </>
  )
}
