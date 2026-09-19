import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  Color,
  Object3D,
  type InstancedMesh,
  type MeshBasicMaterial,
} from 'three'
import type { CityLayout, Building } from '../lib/city-layout.ts'
import { blend, sampleHealth, type HealthSample } from '../lib/health.ts'
import { weathered } from '../lib/palette.ts'
import type { Playhead } from '../lib/series.ts'
import { useLens } from './lens.ts'
import type { SceneProps } from './scene.ts'

const dummy = new Object3D()
const paint = new Color()
const sample: HealthSample = { heat: 0, unused: 0, wear: 0, trend: 0 }
/** Towers stand on the district slabs. */
const LIFT = 0.3
const EMBER = new Color('#ff5a14')
const BLAZE = new Color('#ffd27a')
/** What a cooling hotspot's fire dies down to. */
const ASH = new Color('#5c5452')

/** A building's height at fractional frame `t`, blending the two frames around it. */
function heightAt(b: Building, t: number): number {
  return blend(b.heights, 0, b.heights.length, t)
}

/** Places instance `k` of `mesh`; a zero scale would make a singular matrix, so hidden means a sliver. */
function place(
  mesh: InstancedMesh,
  k: number,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
): void {
  dummy.position.set(...position)
  dummy.scale.set(
    ...(scale.map((s) => Math.max(s, 1e-4)) as [number, number, number]),
  )
  dummy.updateMatrix()
  mesh.setMatrixAt(k, dummy.matrix)
}

/** The three instanced meshes a city redraws. */
interface Meshes {
  readonly body: InstancedMesh
  readonly roof: InstancedMesh
  readonly fire: InstancedMesh
}

/** Where the city was last drawn: playhead and lens. */
interface Drawn {
  readonly t: number
  readonly lens: number
}

/** A frame to draw: where the city is, plus wall-clock seconds for the fires' pulse. */
interface Moment extends Drawn {
  readonly clock: number
}

function ready(meshes: {
  [K in keyof Meshes]: InstancedMesh | null
}): meshes is Meshes {
  return Boolean(meshes.body && meshes.roof && meshes.fire)
}

function moved(last: Drawn, next: Drawn): boolean {
  return last.t !== next.t || last.lens !== next.lens
}

/** Flames flicker every frame, whether or not anything else moved. */
function flicker(flame: MeshBasicMaterial | null, time: number): void {
  flame?.color.setScalar(
    1.4 + 0.35 * Math.sin(time * 9) + 0.2 * Math.sin(time * 23),
  )
}

/** Towers at their height, coloured by the lens. A lens that stays off skips the colours. */
function stackBodies(
  body: InstancedMesh,
  layout: CityLayout,
  at: Drawn,
  recolour: boolean,
): void {
  layout.buildings.forEach((b, i) => {
    const h = heightAt(b, at.t)
    const shown = h > 0 ? 1 : 0
    place(body, i, [b.x, LIFT + h / 2, b.z], [b.w * shown, h, b.d * shown])
    if (!recolour) return
    sampleHealth(layout.health, i, at.t, sample)
    body.setColorAt(i, weathered(b.color, sample, at.lens, paint))
  })
}

/** Beacons on the roofs of the most-called towers. */
function stackRoofs(
  roof: InstancedMesh,
  buildings: readonly Building[],
  lit: readonly number[],
  t: number,
): void {
  lit.forEach((i, k) => {
    const b = buildings[i]!
    const h = heightAt(b, t)
    const s = h > 0 ? 1 : 0
    place(
      roof,
      k,
      [b.x, LIFT + h + 0.02, b.z],
      [b.w * 0.6 * s, 0.04 * s, b.d * 0.6 * s],
    )
  })
}

/**
 * Fire on each hotspot's roof, as big and as white as it is hot. One heating
 * up throbs; one cooling burns low and greys to smoke.
 */
function stackFires(fire: InstancedMesh, layout: CityLayout, at: Moment): void {
  layout.hot.forEach((i, k) => {
    const b = layout.buildings[i]!
    const h = heightAt(b, at.t)
    const standing = h > 0 ? at.lens : 0
    const { heat: raw, trend } = sampleHealth(layout.health, i, at.t, sample)
    const heat = raw * standing
    const rising = Math.max(trend, 0)
    const cooling = Math.max(-trend, 0)
    // The index staggers the beats so a street of fires does not pulse as one.
    const beat = 0.5 + 0.5 * Math.sin(at.clock * 4 + i * 1.7)
    const span = Math.min(b.w, b.d)
    const tall =
      heat > 0
        ? span * (0.3 + 2.2 * heat) * (1 + rising * beat * 0.5 - cooling * 0.4)
        : 0
    const wide = span * 0.7 * heat
    place(fire, k, [b.x, LIFT + h + tall / 2, b.z], [wide, tall, wide])
    fire.setColorAt(
      k,
      paint
        .copy(EMBER)
        .lerp(BLAZE, heat)
        .lerp(ASH, cooling * 0.8),
    )
  })
}

/** Marks a mesh's instances as changed, for three to upload. */
function touch(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** Redraws every tower, beacon and fire for `at`; `was` is the lens last drawn. */
function restack(
  meshes: Meshes,
  layout: CityLayout,
  lit: readonly number[],
  at: Moment,
  was: number,
): void {
  stackBodies(meshes.body, layout, at, at.lens > 0 || was !== 0)
  stackRoofs(meshes.roof, layout.buildings, lit, at.t)
  stackFires(meshes.fire, layout, at)
  for (const mesh of Object.values(meshes)) touch(mesh)
}

/**
 * Draws `next`, given where the city was `last` drawn, and returns where
 * it now stands. Only the fires pulse between moves; the towers stay put until
 * the playhead or the lens moves.
 */
function redraw(
  meshes: Meshes,
  layout: CityLayout,
  lit: readonly number[],
  last: Drawn,
  next: Moment,
): Drawn {
  if (moved(last, next)) {
    restack(meshes, layout, lit, next, last.lens)
    return next
  }
  if (next.lens > 0 && layout.hot.length > 0) {
    stackFires(meshes.fire, layout, next)
    touch(meshes.fire)
  }
  return last
}

/**
 * Towers, their beacons and, under the health lens, their roof fires,
 * re-stacked whenever the playhead or the lens moves. On the CPU rather than
 * in a shader: a standard lit material keeps its lighting, and 12,000 matrices
 * is well inside one frame.
 */
export function Buildings(props: {
  layout: CityLayout
  playhead: Playhead
  lens: boolean
  onHover: SceneProps['onHover']
}): JSX.Element {
  const { layout, playhead } = props
  const { buildings } = layout
  const body = useRef<InstancedMesh>(null)
  const roof = useRef<InstancedMesh>(null)
  const fire = useRef<InstancedMesh>(null)
  const flame = useRef<MeshBasicMaterial>(null)
  const drawn = useRef<Drawn>({ t: Number.NaN, lens: Number.NaN })
  const lens = useLens(props.lens)
  const lit = useMemo(
    () => buildings.flatMap((b, i) => (b.beacon > 0 ? [i] : [])),
    [buildings],
  )

  useLayoutEffect(() => {
    // Beacon colours never change; body colours follow the lens.
    lit.forEach((i, k) =>
      roof.current?.setColorAt(
        k,
        new Color('#ffb46b').multiplyScalar(
          0.6 + buildings[i]!.beacon ** 2 * 4,
        ),
      ),
    )
    drawn.current = { t: Number.NaN, lens: Number.NaN }
  }, [buildings, lit])

  useFrame((state) => {
    flicker(flame.current, state.clock.elapsedTime)
    const next = {
      t: playhead.t,
      lens: lens.current,
      clock: state.clock.elapsedTime,
    }
    const meshes = {
      body: body.current,
      roof: roof.current,
      fire: fire.current,
    }
    if (ready(meshes))
      drawn.current = redraw(meshes, layout, lit, drawn.current, next)
  })

  return (
    <>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, buildings.length]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          props.onHover(e.instanceId ?? null)
        )}
        onPointerOut={() => props.onHover(null)}
      >
        <boxGeometry />
        <meshStandardMaterial roughness={0.55} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, lit.length]}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={fire}
        args={[undefined, undefined, layout.hot.length]}
        // Fire is light, not a solid: it must not steal the pointer from its tower.
        raycast={() => null}
      >
        <coneGeometry args={[0.5, 1, 7]} />
        <meshBasicMaterial ref={flame} toneMapped={false} />
      </instancedMesh>
    </>
  )
}
