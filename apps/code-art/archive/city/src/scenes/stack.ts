import {
  Color,
  InstancedBufferAttribute,
  Object3D,
  type InstancedMesh,
} from 'three'
import type { CityLayout } from '../lib/city-layout.ts'
import { sampleHealth, type HealthSample } from '../lib/health.ts'
import { visibility } from '../lib/series.ts'

/**
 * Placing the city's boxes. Kept out of the component so the arithmetic of a
 * building and its mast is plain, and so the component is only meshes and
 * frames.
 */

const dummy = new Object3D()
const sample: HealthSample = { heat: 0, unused: 0, wear: 0, trend: 0 }

/** Settlements stand on the district slabs. */
export const LIFT = 0.3

/** What a beacon mast glows, before its brightness. */
const BEACON = new Color('#ffb46b')

/** A mast's colour: the brightest beacons pull far ahead of the rest. */
export function beaconOf(beacon: number): Color {
  return BEACON.clone().multiplyScalar(0.6 + beacon ** 2 * 4)
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

/**
 * Places every building, growing each one in as its file gains enough
 * symbols to earn it (mirrors how the galaxy's stars pop in), and samples
 * its file's health into the per-instance attribute the facade shader reads.
 */
function stackBuildings(
  mesh: InstancedMesh,
  layout: CityLayout,
  health: Float32Array,
  t: number,
): void {
  const { buildings } = layout
  for (let k = 0; k < buildings.count; k++) {
    const grow = visibility([buildings.births[k]!, buildings.deaths[k]!], t)
    const h = buildings.h[k]! * grow
    place(
      mesh,
      k,
      [buildings.x[k]!, LIFT + h / 2, buildings.z[k]!],
      [buildings.w[k]!, h, buildings.d[k]!],
    )
    sampleHealth(layout.health, buildings.file[k]!, t, sample)
    health.set([sample.heat, sample.unused, sample.wear, sample.trend], k * 4)
  }
}

/** Masts on the roofs of the most-called settlements' landmarks. */
function stackMasts(
  mesh: InstancedMesh,
  layout: CityLayout,
  lit: readonly number[],
  t: number,
): void {
  lit.forEach((settlement, k) => {
    const s = layout.settlements[settlement]!
    const grow = visibility(
      [
        layout.buildings.births[s.landmark]!,
        layout.buildings.deaths[s.landmark]!,
      ],
      t,
    )
    const h = s.h * grow
    const mast = layout.unit * (0.15 + layout.beacons[s.file]! * 0.9)
    const thin = Math.min(s.w, s.d) * 0.025
    place(mesh, k, [s.x, LIFT + h + mast / 2, s.z], [thin, mast * grow, thin])
  })
}

/** Marks a mesh's instances as changed, for three to upload. */
function touch(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** The two instanced meshes a city redraws. */
export interface Meshes {
  readonly shaft: InstancedMesh
  readonly mast: InstancedMesh
}

/** Whether every mesh a redraw needs has mounted. */
export function ready(meshes: {
  [K in keyof Meshes]: InstancedMesh | null
}): meshes is Meshes {
  return Boolean(meshes.shaft && meshes.mast)
}

/**
 * Sets what never changes once a layout is built: the shell and beacon
 * colours, and how many mast instances are drawn. A city with no beacons is
 * still allotted one instance, so the count is what decides whether a stray
 * box appears at the origin.
 */
export function dress(
  meshes: Meshes,
  layout: CityLayout,
  lit: readonly number[],
): void {
  // One flat write for every shell colour, rather than a `setColorAt` loop:
  // `buildings.color` is already laid out exactly as `instanceColor` wants it.
  meshes.shaft.instanceColor = new InstancedBufferAttribute(
    layout.buildings.color.slice(),
    3,
  )
  lit.forEach((settlement, k) =>
    meshes.mast.setColorAt(
      k,
      beaconOf(layout.beacons[layout.settlements[settlement]!.file]!),
    ),
  )
  if (meshes.mast.instanceColor) meshes.mast.instanceColor.needsUpdate = true
  meshes.mast.count = lit.length
}

/** Redraws every building and mast at playhead `t`. */
export function restack(
  meshes: Meshes,
  layout: CityLayout,
  health: Float32Array,
  lit: readonly number[],
  t: number,
): void {
  stackBuildings(meshes.shaft, layout, health, t)
  stackMasts(meshes.mast, layout, lit, t)
  touch(meshes.shaft)
  const attr = meshes.shaft.geometry.getAttribute('aHealth')
  if (attr) attr.needsUpdate = true
  touch(meshes.mast)
}
