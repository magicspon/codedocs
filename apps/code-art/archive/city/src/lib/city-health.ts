import type { HealthTracks } from './health.ts'
import type { Series } from './series.ts'

/**
 * The city's own health readings, taken out of `health.ts` when the city was
 * archived, so the galaxy's code holds nothing only the city used.
 */

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
