import { Color } from 'three'
import { symbolCount, type FileDatum } from './atlas.ts'
import { litOf } from './facade.ts'
import {
  GENERATED_COLOR,
  KIND_COLORS,
  ROLE_COLORS,
  projectColor,
} from './palette.ts'
import { hash, rng } from './rng.ts'
import type { Life, Series } from './series.ts'
import type { Rect } from './treemap.ts'

/**
 * The city's population, on the galaxy's own terms: a file is a settlement,
 * and its symbols are buildings inside it, scattered from the file's `kinds`
 * counts alone -- exactly how the galaxy scatters stars -- so no symbol name
 * is read until a settlement is picked (Phase 3).
 *
 * Population (symbol count) decides a settlement's tier: a village is a
 * quiet file, a town a file with plenty declared, a city a symbol-dense one.
 * Connectivity (calls and references touching the file) decides how tall its
 * buildings stand: two files with the same population read as different
 * skylines if one is far busier than the other.
 */

/** Population percentile past which a file is at least a town, then a city. */
const TOWN_AT = 0.5
const CITY_AT = 0.85

/**
 * However many symbols a file declares, no settlement draws more than this
 * many buildings -- unlike the galaxy's point-sprite stars, these are opaque
 * lit boxes, which cost far more per instance. vscode's 12,519 files hold
 * 527,160 symbols; a cap of 320 (one per symbol up to that) drew ~489,000
 * boxes and measured roughly 8x slower per frame in headless Chromium than
 * the galaxy's own vscode scene at matched instance counts. This cap keeps
 * vscode's total near 60,000 -- a handful of buildings per busy file rather
 * than one per symbol -- which measured back in galaxy's own ballpark.
 */
const MAX_BUILDINGS = 6

/** Per-kind footprint, echoing the planet sizes `orbits.ts` gives each kind. */
const FOOTPRINT: readonly number[] = [
  0.5, 0.85, 0.6, 0.45, 0.55, 0.4, 0.45, 0.8,
]

/** Per-kind height, before connectivity and jitter scale it. */
const HEIGHT: readonly number[] = [0.4, 1.4, 0.7, 0.35, 0.6, 0.3, 0.35, 1.3]

/** A plain window lamp, before a building's own kind tints it. */
const LAMP = new Color('#ffdca8')

/** One file, standing as a settlement. */
export interface Settlement {
  readonly file: number
  /** By population: `0` village, `1` town, `2` city. */
  readonly tier: number
  readonly x: number
  readonly z: number
  readonly w: number
  readonly d: number
  /** The tallest of this settlement's buildings. */
  readonly h: number
  /** First index of this settlement's buildings in `Buildings`. */
  readonly offset: number
  readonly count: number
  /** Absolute building index of the tallest: where a mast or alarm stands. */
  readonly landmark: number
}

/** Every building in the city, flattened, one entry per symbol. */
export interface Buildings {
  readonly count: number
  readonly x: Float32Array
  readonly z: Float32Array
  readonly w: Float32Array
  readonly d: Float32Array
  readonly h: Float32Array
  /** The shell colour: role tinted by project. */
  readonly color: Float32Array
  /** What the building glows when lit: its own kind's colour. */
  readonly lamp: Float32Array
  /** `1` where the building is normally lit, `0` otherwise. */
  readonly lit: Float32Array
  /** Owning file, for the health and focus lookups. */
  readonly file: Float32Array
  /** Staggers each building's alarm beat. */
  readonly seed: Float32Array
  readonly births: Float32Array
  readonly deaths: Float32Array
}

/** Ranks `values`, lowest first, as `[0, 1]`; ties keep sort order. */
function percentileRank(values: readonly number[]): Float32Array {
  const n = values.length
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!)
  const rank = new Float32Array(n)
  order.forEach((i, r) => (rank[i] = n > 1 ? r / (n - 1) : 1))
  return rank
}

/** Village, town or city, from a population percentile. */
function tierOf(rank: number): number {
  return rank >= CITY_AT ? 2 : rank >= TOWN_AT ? 1 : 0
}

/** Every building's kind, walking the file's `kinds` counts in order. */
function kindsOf(file: FileDatum, shown: number, total: number): Uint8Array {
  const kinds = new Uint8Array(shown)
  // A file with nothing declared draws only its stairwell placeholder;
  // walking zero counts below would otherwise run off the end at `namespace`.
  if (total <= 0) return kinds
  let kind = 0
  let seen = 0
  for (let k = 0; k < shown; k++) {
    const at = (k / shown) * total
    while (kind < 7 && seen + (file.kinds[kind] ?? 0) <= at)
      seen += file.kinds[kind++] ?? 0
    kinds[k] = kind
  }
  return kinds
}

/**
 * When building `k` of `shown` (kind-ordered) pops in: while the file has
 * enough symbols that its share of `shown` buildings reaches `k`. Mirrors
 * `starLife` in `galaxy-layout.ts` -- the galaxy's stars pop in the same way.
 */
function buildingLife(
  series: Series,
  file: number,
  k: number,
  shown: number,
  total: number,
): Life {
  let birth = -1
  let death = 0
  series.at.forEach((row, f) => {
    const datum = row[file]
    if (datum && k < (shown * symbolCount(datum)) / total) {
      if (birth < 0) birth = f
      death = f + 1
    }
  })
  return birth < 0 ? [0, 0] : [birth, death]
}

/** Packs `count` cells into a `w` by `d` rect, as square as the count allows. */
function grid(
  count: number,
  w: number,
  d: number,
): { xs: Float64Array; zs: Float64Array; cell: number } {
  const cols = Math.max(
    1,
    Math.round(Math.sqrt((count * w) / Math.max(d, 1e-6))),
  )
  const rows = Math.max(1, Math.ceil(count / cols))
  const cellW = w / cols
  const cellD = d / rows
  const xs = new Float64Array(count)
  const zs = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    xs[k] = -w / 2 + cellW * ((k % cols) + 0.5)
    zs[k] = -d / 2 + cellD * (Math.floor(k / cols) + 0.5)
  }
  return { xs, zs, cell: Math.min(cellW, cellD) }
}

/**
 * Lays out every settlement and its buildings. `plots` is one rect per file,
 * in file order, from `treemap()`; `unit` scales heights against the city's
 * own grid the way `cityLayout` already sizes everything else.
 */
export function settlementsOf(
  series: Series,
  plots: readonly Rect[],
  unit: number,
): { settlements: Settlement[]; buildings: Buildings } {
  const { files } = series.merged

  const population = files.map((f) => symbolCount(f))
  const populationRank = percentileRank(population)
  const activity = files.map(
    (f) => f.callsIn + f.callsOut + f.callsSelf * 0.5 + f.refsIn * 0.5,
  )
  const activityRank = percentileRank(activity)

  const counts = population.map((p) => Math.max(1, Math.min(MAX_BUILDINGS, p)))
  const total = counts.reduce((a, b) => a + b, 0)
  const buildings: Buildings = {
    count: total,
    x: new Float32Array(total),
    z: new Float32Array(total),
    w: new Float32Array(total),
    d: new Float32Array(total),
    h: new Float32Array(total),
    color: new Float32Array(total * 3),
    lamp: new Float32Array(total * 3),
    lit: new Float32Array(total),
    file: new Float32Array(total),
    seed: new Float32Array(total),
    births: new Float32Array(total),
    deaths: new Float32Array(total),
  }

  const settlements: Settlement[] = []
  let offset = 0
  files.forEach((f, i) => {
    const rect = plots[i]!
    const gap = Math.min(rect.w, rect.h) * 0.14
    const w = Math.max(rect.w - gap, 0.05)
    const d = Math.max(rect.h - gap, 0.05)
    const cx = rect.x + rect.w / 2
    const cz = rect.y + rect.h / 2

    const shown = counts[i]!
    // A file that declares nothing still gets one stairwell placeholder, so
    // `buildingLife`'s division stays safe; `kindsOf` is told the truth.
    const declared = Math.max(1, population[i]!)
    const kinds = kindsOf(f, shown, population[i]!)
    const { xs, zs, cell } = grid(shown, w, d)
    const random = rng(hash(f.path))
    const lit = litOf(f)
    const base = f.generated ? GENERATED_COLOR : ROLE_COLORS[f.role]!
    const shell = base
      .clone()
      .lerp(projectColor(f.project), 0.3)
      .multiplyScalar(0.3 + random() * 0.22)
    const scale = unit * (0.5 + 1.3 * activityRank[i]!)

    let landmark = offset
    let tallest = -1
    for (let k = 0; k < shown; k++, offset++) {
      const kind = kinds[k]!
      const jitter = 0.75 + 0.5 * random()
      const h = scale * HEIGHT[kind]! * jitter
      const size = cell * FOOTPRINT[kind]! * 0.78
      buildings.x[offset] = cx + xs[k]!
      buildings.z[offset] = cz + zs[k]!
      buildings.w[offset] = size
      buildings.d[offset] = size
      buildings.h[offset] = h
      buildings.color.set(
        [
          shell.r * (0.85 + 0.3 * random()),
          shell.g * (0.85 + 0.3 * random()),
          shell.b * (0.85 + 0.3 * random()),
        ],
        offset * 3,
      )
      const lamp = LAMP.clone().lerp(KIND_COLORS[kind]!, 0.4)
      buildings.lamp.set([lamp.r, lamp.g, lamp.b], offset * 3)
      buildings.lit[offset] = random() < lit ? 1 : 0
      buildings.file[offset] = i
      buildings.seed[offset] = random()
      ;[buildings.births[offset], buildings.deaths[offset]] = buildingLife(
        series,
        i,
        k,
        shown,
        declared,
      )
      if (h > tallest) {
        tallest = h
        landmark = offset
      }
    }

    settlements.push({
      file: i,
      tier: tierOf(populationRank[i]!),
      x: cx,
      z: cz,
      w,
      d,
      h: tallest,
      offset: offset - shown,
      count: shown,
      landmark,
    })
  })

  return { settlements, buildings }
}
