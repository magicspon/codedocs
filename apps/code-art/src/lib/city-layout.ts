import { ROLE_COLORS } from './palette.ts'
import {
  everHot,
  healthTracks,
  smogPerFrame,
  type HealthTracks,
} from './health.ts'
import { hash, rng } from './rng.ts'
import { settlementsOf, type Buildings, type Settlement } from './settlement.ts'
import type { Series } from './series.ts'
import { treemap, type Region } from './treemap.ts'

/**
 * The city's geometry, on the galaxy's own terms. A file is a settlement --
 * a village if it declares few symbols, a town if it declares plenty, a city
 * if it is both symbol-dense and well connected -- standing on a directory's
 * district exactly as before. Its buildings are its own symbols, scattered
 * from the file's `kinds` counts the way the galaxy scatters stars, sized by
 * kind and by how much of the codebase reaches the file. Roads (Phase 2)
 * will connect settlements the way arcs currently do; under the health lens,
 * hotspots raise an alarm pillar over a settlement's tallest building.
 */

export type { Settlement, Buildings }

export interface CityLayout {
  /** One settlement per file, in `Atlas.files` order. */
  readonly settlements: readonly Settlement[]
  /** Every settlement's buildings, flattened, one entry per symbol. */
  readonly buildings: Buildings
  readonly districts: readonly Region[]
  /** Arc line segments plus, per vertex, how far along its arc it is and the arc's phase. */
  readonly traffic: {
    readonly positions: Float32Array
    readonly colors: Float32Array
    readonly progress: Float32Array
    readonly phase: Float32Array
    readonly births: Float32Array
    readonly deaths: Float32Array
  }
  readonly health: HealthTracks
  /** Beacon brightness per settlement, in `[0, 1]`; `0` means no beacon. */
  readonly beacons: Float32Array
  /** Files that are a hotspot in any frame: the only settlements that can raise an alarm. */
  readonly hot: readonly number[]
  /** How choked the air is in each frame, in `[0, 1]`. */
  readonly smog: Float32Array
  /** Side length of the city square. */
  readonly size: number
  /** A typical settlement's width, which the camera and fog scale by. */
  readonly unit: number
}

const MAX_ARCS = 1200
const ARC_SEGMENTS = 24

/** Builds every buffer the city scene draws. */
export function cityLayout(series: Series): CityLayout {
  const atlas = series.merged
  const { files } = atlas
  const size = 10 * Math.sqrt(files.length) + 20
  const unit = size / Math.sqrt(files.length) / 2
  // A floor so a two-line barrel file still gets a plot of land.
  const plots = treemap(
    files.map((f) => f.path),
    files.map((f) => Math.max(f.size, 600)),
    size,
    unit * 0.35,
  )
  const { settlements, buildings } = settlementsOf(series, plots.files, unit)

  const maxBeacon = Math.log1p(Math.max(1, ...files.map((f) => f.callsIn)))
  // Only the most-called fifth get a beacon, so a lit roof means something.
  const called = files
    .map((f) => f.callsIn)
    .filter((c) => c > 0)
    .sort((a, b) => b - a)
  const beaconFloor = called[Math.floor(called.length * 0.2)] ?? Infinity
  const beacons = Float32Array.from(files, (f) =>
    f.callsIn >= Math.max(beaconFloor, 1)
      ? Math.log1p(f.callsIn) / maxBeacon
      : 0,
  )

  const arcs = atlas.calls.slice(0, MAX_ARCS)
  const vertices = arcs.length * ARC_SEGMENTS * 2
  const traffic = {
    positions: new Float32Array(vertices * 3),
    colors: new Float32Array(vertices * 3),
    progress: new Float32Array(vertices),
    phase: new Float32Array(vertices),
    births: new Float32Array(vertices),
    deaths: new Float32Array(vertices),
  }
  const random = rng(hash(atlas.name) ^ 0x9e3779b9)
  let v = 0
  for (const [arc, [from, to]] of arcs.entries()) {
    const [birth, death] = series.callLife[arc]!
    const a = settlements[from]!
    const b = settlements[to]!
    const span = Math.hypot(b.x - a.x, b.z - a.z)
    const lift = Math.max(a.h, b.h) + span * 0.16
    const phase = random()
    const ca = ROLE_COLORS[files[from]!.role]!
    const point = (t: number): [number, number, number] => {
      // A quadratic Bézier whose control point floats above the midpoint.
      const u = 1 - t
      const y = u * u * a.h + 2 * u * t * lift + t * t * b.h
      return [a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t]
    }
    for (let s = 0; s < ARC_SEGMENTS; s++) {
      for (const t of [s / ARC_SEGMENTS, (s + 1) / ARC_SEGMENTS]) {
        traffic.positions.set(point(t), v * 3)
        traffic.colors.set([ca.r, ca.g, ca.b], v * 3)
        traffic.progress[v] = t
        traffic.phase[v] = phase
        traffic.births[v] = birth
        traffic.deaths[v] = death
        v++
      }
    }
  }

  const health = healthTracks(series)
  return {
    settlements,
    buildings,
    districts: plots.regions,
    traffic,
    health,
    beacons,
    hot: files.flatMap((_, i) => (everHot(health, i) ? [i] : [])),
    smog: smogPerFrame(health, series),
    size,
    unit,
  }
}
