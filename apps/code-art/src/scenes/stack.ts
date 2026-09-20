import { Color, Object3D, type InstancedMesh } from 'three'
import {
  shaftOf,
  tierAt,
  type Building,
  type CityLayout,
} from '../lib/city-layout.ts'
import { blend, sampleHealth, type HealthSample } from '../lib/health.ts'

/**
 * Placing the city's boxes. Kept out of the component so the arithmetic of a
 * shaft, its setbacks and its mast is plain, and so the component is only
 * meshes and frames.
 */

const dummy = new Object3D()
const sample: HealthSample = { heat: 0, unused: 0, wear: 0, trend: 0 }

/** Towers stand on the district slabs. */
export const LIFT = 0.3

/** What a beacon mast glows, before its brightness. */
const BEACON = new Color('#ffb46b')

/** A mast's colour: the brightest beacons pull far ahead of the rest. */
export function beaconOf(beacon: number): Color {
  return BEACON.clone().multiplyScalar(0.6 + beacon ** 2 * 4)
}

/** A building's height at fractional frame `t`, blending the two frames around it. */
export function heightAt(b: Building, t: number): number {
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

/**
 * The per-instance attributes a run of instances feeds the facade shader.
 * `owners` says which building each instance belongs to, so a setback wears
 * the same facade as the shaft it caps.
 */
export interface Run {
  readonly owners: readonly number[]
  /** Two per instance: lit share and seed. */
  readonly facade: Float32Array
  /** Three per instance: the lamp colour. */
  readonly lamp: Float32Array
  /** Four per instance: heat, unused, wear and trend at the playhead. */
  readonly health: Float32Array
}

/** Builds a run's static attributes from the buildings its instances belong to. */
export function runOf(
  buildings: readonly Building[],
  owners: readonly number[],
): Run {
  const run = {
    owners,
    facade: new Float32Array(owners.length * 2),
    lamp: new Float32Array(owners.length * 3),
    health: new Float32Array(owners.length * 4),
  }
  owners.forEach((i, k) => {
    const { facade } = buildings[i]!
    run.facade[k * 2] = facade.lit
    run.facade[k * 2 + 1] = facade.seed
    run.lamp.set([facade.lamp.r, facade.lamp.g, facade.lamp.b], k * 3)
  })
  return run
}

/** Reads every instance's health at `t` into its attribute. */
function readHealth(layout: CityLayout, run: Run, t: number): void {
  run.owners.forEach((file, k) => {
    sampleHealth(layout.health, file, t, sample)
    run.health.set(
      [sample.heat, sample.unused, sample.wear, sample.trend],
      k * 4,
    )
  })
}

/** Every tower's shaft: all of its height, less whatever its setbacks take. */
function stackShafts(
  mesh: InstancedMesh,
  buildings: readonly Building[],
  t: number,
): void {
  buildings.forEach((b, i) => {
    const h = heightAt(b, t)
    const shaft = shaftOf(b, h)
    const shown = h > 0 ? 1 : 0
    place(
      mesh,
      i,
      [b.x, LIFT + shaft / 2, b.z],
      [b.w * shown, shaft, b.d * shown],
    )
  })
}

/** The setbacks stepping back up each tower's crown. */
function stackTiers(mesh: InstancedMesh, layout: CityLayout, t: number): void {
  layout.tiers.forEach((tier, k) => {
    const b = layout.buildings[tier.building]!
    const h = heightAt(b, t)
    const [base, block, inset] = tierAt(tier, h)
    const shown = h > 0 ? 1 : 0
    place(
      mesh,
      k,
      [b.x, LIFT + base + block / 2, b.z],
      [b.w * inset * shown, block, b.d * inset * shown],
    )
  })
}

/** Masts on the roofs of the most-called towers, as tall as the calls arriving. */
function stackMasts(
  mesh: InstancedMesh,
  layout: CityLayout,
  lit: readonly number[],
  t: number,
): void {
  lit.forEach((i, k) => {
    const b = layout.buildings[i]!
    const h = heightAt(b, t)
    const shown = h > 0 ? 1 : 0
    const mast = layout.unit * (0.15 + b.beacon * 0.9)
    const thin = Math.min(b.w, b.d) * 0.025
    place(mesh, k, [b.x, LIFT + h + mast / 2, b.z], [thin, mast * shown, thin])
  })
}

/** Marks a mesh's instances as changed, for three to upload. */
function touch(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true
  const health = mesh.geometry.getAttribute('aHealth')
  if (health) health.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** The three instanced meshes a city redraws. */
export interface Meshes {
  readonly shaft: InstancedMesh
  readonly tier: InstancedMesh
  readonly mast: InstancedMesh
}

/** Whether every mesh a redraw needs has mounted. */
export function ready(meshes: {
  [K in keyof Meshes]: InstancedMesh | null
}): meshes is Meshes {
  return Boolean(meshes.shaft && meshes.tier && meshes.mast)
}

/**
 * Sets what never changes once a layout is built: the shell and beacon
 * colours, which the lens works on in the shader rather than here, and how
 * many instances of each mesh are drawn. A city with no setbacks and no
 * beacons is still allotted one instance of each, so the count is what decides
 * whether a stray box appears at the origin.
 */
export function dress(
  meshes: Meshes,
  layout: CityLayout,
  lit: readonly number[],
): void {
  const { buildings } = layout
  buildings.forEach((b, i) => meshes.shaft.setColorAt(i, b.color))
  layout.tiers.forEach((t, k) =>
    meshes.tier.setColorAt(k, buildings[t.building]!.color),
  )
  lit.forEach((i, k) =>
    meshes.mast.setColorAt(k, beaconOf(buildings[i]!.beacon)),
  )
  for (const mesh of Object.values(meshes))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  meshes.tier.count = layout.tiers.length
  meshes.mast.count = lit.length
}

/** Redraws every shaft, setback and mast at playhead `t`. */
export function restack(
  meshes: Meshes,
  layout: CityLayout,
  runs: { readonly shaft: Run; readonly tier: Run },
  lit: readonly number[],
  t: number,
): void {
  stackShafts(meshes.shaft, layout.buildings, t)
  stackTiers(meshes.tier, layout, t)
  stackMasts(meshes.mast, layout, lit, t)
  readHealth(layout, runs.shaft, t)
  readHealth(layout, runs.tier, t)
  for (const mesh of Object.values(meshes)) touch(mesh)
}
