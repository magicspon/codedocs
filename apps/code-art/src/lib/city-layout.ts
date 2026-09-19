import { Color } from 'three'
import { symbolCount } from './atlas.ts'
import { everHot, healthTracks, type HealthTracks } from './health.ts'
import { GENERATED_COLOR, ROLE_COLORS, projectColor } from './palette.ts'
import { hash, rng } from './rng.ts'
import type { Series } from './series.ts'
import { treemap, type Region } from './treemap.ts'

/**
 * The city's geometry. Directories are districts, files are buildings:
 * footprint from bytes, height from symbols, colour from role, and a rooftop
 * beacon as bright as the calls arriving from elsewhere. Under the health lens,
 * hotspots burn on their roofs, unused files go dark and hard-to-change files
 * weather.
 */

/** One building, in `Atlas.files` order so an instance id is a file index. */
export interface Building {
  readonly x: number
  readonly z: number
  readonly w: number
  readonly d: number
  /** Height at its tallest, which the layout and arcs are sized for. */
  readonly h: number
  /** Height in each frame; `0` where the file does not exist. */
  readonly heights: Float32Array
  readonly color: Color
  /** Beacon brightness in `[0, 1]`; `0` means no beacon. */
  readonly beacon: number
}

export interface CityLayout {
  readonly buildings: readonly Building[]
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
  /** Files that are a hotspot in any frame: the only roofs that can burn. */
  readonly hot: readonly number[]
  /** Side length of the city square. */
  readonly size: number
  /** A typical building's width, which the camera and fog scale by. */
  readonly unit: number
}

const MAX_ARCS = 1200
const ARC_SEGMENTS = 24

/** Builds every buffer the city scene draws. */
export function cityLayout(series: Series): CityLayout {
  const atlas = series.merged
  const { files } = atlas
  const random = rng(hash(atlas.name) ^ 0x9e3779b9)
  const size = 10 * Math.sqrt(files.length) + 20
  const unit = size / Math.sqrt(files.length) / 2
  // A floor so a two-line barrel file still gets a plot of land.
  const layout = treemap(
    files.map((f) => f.path),
    files.map((f) => Math.max(f.size, 600)),
    size,
    unit * 0.35,
  )
  const maxBeacon = Math.log1p(Math.max(1, ...files.map((f) => f.callsIn)))
  // Only the most-called fifth get a beacon, so a lit roof means something.
  const called = files
    .map((f) => f.callsIn)
    .filter((c) => c > 0)
    .sort((a, b) => b - a)
  const beaconFloor = called[Math.floor(called.length * 0.2)] ?? Infinity

  const buildings = files.map((f, i): Building => {
    const rect = layout.files[i]!
    const gap = Math.min(rect.w, rect.h) * 0.14
    const base = f.generated ? GENERATED_COLOR : ROLE_COLORS[f.role]!
    const color = base
      .clone()
      .lerp(projectColor(f.project), 0.3)
      .multiplyScalar(0.55 + random() * 0.3)
    return {
      x: rect.x + rect.w / 2,
      z: rect.y + rect.h / 2,
      w: Math.max(rect.w - gap, 0.05),
      d: Math.max(rect.h - gap, 0.05),
      h: unit * (0.25 + Math.sqrt(symbolCount(f)) * 0.55),
      heights: Float32Array.from(series.at, (row) => {
        const datum = row[i]
        return datum ? unit * (0.25 + Math.sqrt(symbolCount(datum)) * 0.55) : 0
      }),
      color,
      beacon:
        f.callsIn >= Math.max(beaconFloor, 1)
          ? Math.log1p(f.callsIn) / maxBeacon
          : 0,
    }
  })

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
  let v = 0
  for (const [arc, [from, to]] of arcs.entries()) {
    const [birth, death] = series.callLife[arc]!
    const a = buildings[from]!
    const b = buildings[to]!
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
    buildings,
    districts: layout.regions,
    traffic,
    health,
    hot: files.flatMap((_, i) => (everHot(health, i) ? [i] : [])),
    size,
    unit,
  }
}
