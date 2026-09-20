import type { FileHealth } from './atlas.ts'
import type { Series } from './series.ts'

/**
 * fallow's readings as per-frame tracks the scenes can blend, the way building
 * heights blend. Each track is flat: file `i` at frame `f` sits at
 * `i * frames + f`, so a vscode timeline is three typed arrays, not 150,000
 * small ones.
 */
export interface HealthTracks {
  readonly frames: number
  /** Hotspot strength in `[0, 1]`; `0` when the file is not a hotspot. */
  readonly heat: Float32Array
  /** `1` where the file is reachable from no entry point, else `0`. */
  readonly unused: Float32Array
  /** How hard the file is to change, in `[0, 1]`; `0` when fallow did not score it. */
  readonly wear: Float32Array
  /** Hotspot trend in `[-1, 1]`: `1` heating up, `-1` cooling; `0` when not a hotspot. */
  readonly trend: Float32Array
}

/** One file's blended reading at a moment in the history. */
export interface HealthSample {
  heat: number
  unused: number
  wear: number
  trend: number
}

/**
 * Maintainability at or above this reads as sound. fallow's index runs 0–100,
 * but real files sit between about 50 and 99; a healthy repo's worst file
 * lands near 85, so wear starts there.
 */
const SOUND = 85
/** Maintainability at or below this reads as fully worn. */
const WORN = 50

/**
 * Hotspot strength. Scores cluster near zero with a long tail, so a square
 * root keeps a score of 10 visible without letting the top one swamp the rest.
 */
export function heatOf(health: FileHealth | undefined): number {
  return Math.sqrt(Math.min(100, health?.hotspot ?? 0) / 100)
}

/** Wear from maintainability; a file fallow did not score is not drawn as worn. */
export function wearOf(health: FileHealth | undefined): number {
  const mi = health?.score?.maintainability
  if (mi === undefined) return 0
  return Math.min(1, Math.max(0, (SOUND - mi) / (SOUND - WORN)))
}

/**
 * Hotspot trend. fallow gives every file one, but only a hotspot's is drawn:
 * a cold file "heating up" has nothing yet to burn.
 */
export function trendOf(health: FileHealth | undefined): number {
  if (!health || health.hotspot <= 0) return 0
  return Math.sign(health.trend)
}

/**
 * Builds the tracks for every merged file. Unused files are only marked when
 * the newest frame's fallow run trusted its dead-code findings.
 */
export function healthTracks(series: Series): HealthTracks {
  const frames = series.at.length
  const n = series.merged.files.length
  const deadCode = series.merged.fallow?.deadCode ?? false
  const tracks = {
    frames,
    heat: new Float32Array(n * frames),
    unused: new Float32Array(n * frames),
    wear: new Float32Array(n * frames),
    trend: new Float32Array(n * frames),
  }
  series.at.forEach((row, f) => {
    row.forEach((datum, i) => {
      const health = datum?.health
      if (!health) return
      const at = i * frames + f
      tracks.heat[at] = heatOf(health)
      tracks.unused[at] = deadCode && health.unused ? 1 : 0
      tracks.wear[at] = wearOf(health)
      tracks.trend[at] = trendOf(health)
    })
  })
  return tracks
}

/**
 * How much of a file's reading counts as trouble. They sum to one, so a city
 * where every file is as bad as it gets reads as `1`.
 */
const WEIGHTS = { heat: 0.5, wear: 0.35, unused: 0.15 }

/**
 * The share of trouble at which the air reads as half choked. A tenth of the
 * city being fully hot, worn or unreachable is a bad but survivable repository,
 * so that is where the smog sits at half.
 */
const HALF_CHOKED = 0.1

/**
 * The city's weather, per frame, in `[0, 1]`: the average file's trouble,
 * curved so the difference between a sound repository and a middling one is
 * visible rather than lost against the worst imaginable one. Averaged over the
 * files that exist in the frame, so a repository does not look healthier
 * simply for being younger than its newest file.
 */
export function smogPerFrame(
  tracks: HealthTracks,
  series: Series,
): Float32Array {
  const smog = new Float32Array(tracks.frames)
  series.at.forEach((row, f) => {
    let total = 0
    let present = 0
    row.forEach((datum, i) => {
      if (!datum) return
      present++
      const at = i * tracks.frames + f
      total +=
        WEIGHTS.heat * tracks.heat[at]! +
        WEIGHTS.wear * tracks.wear[at]! +
        WEIGHTS.unused * tracks.unused[at]!
    })
    const share = present > 0 ? total / present : 0
    smog[f] = share / (share + HALF_CHOKED)
  })
  return smog
}

/** Whether any file ever reads as a hotspot, per merged file. */
export function everHot(tracks: HealthTracks, file: number): boolean {
  for (let f = 0; f < tracks.frames; f++)
    if (tracks.heat[file * tracks.frames + f]! > 0) return true
  return false
}

/**
 * The value at fractional frame `t` in a run of per-frame values starting at
 * `offset`, blending the two frames around it.
 */
export function blend(
  values: ArrayLike<number>,
  offset: number,
  frames: number,
  t: number,
): number {
  const f0 = Math.max(0, Math.min(Math.floor(t), frames - 1))
  const f1 = Math.min(f0 + 1, frames - 1)
  const v0 = values[offset + f0] ?? 0
  return v0 + ((values[offset + f1] ?? 0) - v0) * Math.max(0, t - f0)
}

/** Fills `out` with file `file`'s reading at fractional frame `t`. */
export function sampleHealth(
  tracks: HealthTracks,
  file: number,
  t: number,
  out: HealthSample,
): HealthSample {
  const offset = file * tracks.frames
  out.heat = blend(tracks.heat, offset, tracks.frames, t)
  out.unused = blend(tracks.unused, offset, tracks.frames, t)
  out.wear = blend(tracks.wear, offset, tracks.frames, t)
  out.trend = blend(tracks.trend, offset, tracks.frames, t)
  return out
}
