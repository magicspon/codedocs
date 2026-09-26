import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type JSX } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import { alarmMaterial } from '../lib/alarm.ts'
import type { CityLayout } from '../lib/city-layout.ts'
import { sampleHealth, type HealthSample } from '../lib/health.ts'
import { hash, rng } from '../lib/rng.ts'
import { visibility, type Playhead } from '../lib/series.ts'
import { useLens } from './lens.ts'
import { LIFT } from './stack.ts'

const dummy = new Object3D()
const sample: HealthSample = { heat: 0, unused: 0, wear: 0, trend: 0 }

/** How tall a column stands over its roof, from barely warm to hottest, in units. */
const SHORTEST = 0.8
const TALLEST = 4

/** Rewrites every column for the playhead at `t`, and its alarm attribute. */
function raise(
  mesh: InstancedMesh,
  layout: CityLayout,
  alarm: Float32Array,
  t: number,
): void {
  layout.hot.forEach((i, k) => {
    const s = layout.settlements[i]!
    const grow = visibility(
      [
        layout.buildings.births[s.landmark]!,
        layout.buildings.deaths[s.landmark]!,
      ],
      t,
    )
    const h = s.h * grow
    const { heat, trend } = sampleHealth(layout.health, i, t, sample)
    // A settlement not yet built, or not yet hot, raises nothing.
    const shown = h > 0 ? heat : 0
    // The column has to stand on the roof, so its height and the height its
    // centre is lifted by must be the same number.
    const tall = shown > 0 ? layout.unit * (SHORTEST + TALLEST * shown) : 1e-4
    const wide = Math.min(s.w, s.d) * 0.1
    dummy.position.set(s.x, LIFT + h + tall / 2, s.z)
    dummy.scale.set(wide, tall, wide)
    dummy.updateMatrix()
    mesh.setMatrixAt(k, dummy.matrix)
    alarm[k * 3] = shown
    alarm[k * 3 + 1] = trend
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.geometry.getAttribute('aAlarm').needsUpdate = true
  mesh.computeBoundingSphere()
}

/**
 * A column of warning light on every hotspot settlement's landmark, as tall
 * and as red as the file is hot: one heating up sends a pulse climbing it,
 * one cooling burns low and grey. Only files that are a hotspot in some
 * frame get a column, so a healthy city raises none.
 */
export function Alarms(props: {
  layout: CityLayout
  playhead: Playhead
  lens: boolean
}): JSX.Element {
  const { layout, playhead } = props
  const mesh = useRef<InstancedMesh>(null)
  const drawn = useRef(Number.NaN)
  const lens = useLens(props.lens)
  const material = useMemo(alarmMaterial, [])
  // The third slot is a fixed phase, so a street of columns does not pulse as one.
  const alarm = useMemo(() => {
    const random = rng(hash(layout.settlements.length.toString()))
    const values = new Float32Array(Math.max(layout.hot.length, 1) * 3)
    for (let k = 0; k < layout.hot.length; k++) values[k * 3 + 2] = random()
    return values
  }, [layout])

  useFrame((state) => {
    material.uniforms.uClock!.value = state.clock.elapsedTime
    material.uniforms.uLens!.value = lens.current
    if (mesh.current) mesh.current.count = layout.hot.length
    if (mesh.current && drawn.current !== playhead.t) {
      raise(mesh.current, layout, alarm, playhead.t)
      drawn.current = playhead.t
    }
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(layout.hot.length, 1)]}
      material={material}
      // Light, not a solid: it must not steal the pointer from its tower.
      raycast={() => null}
    >
      {/* Open-ended and wider at the top, so it reads as a beam rather than a can. */}
      <cylinderGeometry args={[1, 0.55, 1, 14, 1, true]}>
        <instancedBufferAttribute
          attach="attributes-aAlarm"
          args={[alarm, 3]}
        />
      </cylinderGeometry>
    </instancedMesh>
  )
}
