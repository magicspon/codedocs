import type { RealisedTrack } from '@codedocs/codesong/browser'

/**
 * Which symbol names to launch as the music moves on. Pure bookkeeping, kept
 * out of the scene so it can be tested without a renderer.
 */

/** Least beats between two names from one track. */
const GAP = 1
/** A jump this far means the viewer seeked rather than the music moved on. */
const JUMP = 2

/** Where each track is being read from, and when it last launched a name. */
export interface Reader {
  readonly cursor: number[]
  readonly lastLaunch: number[]
}

/** One note whose name should rise now: a track index and a note index. */
export interface Launch {
  readonly track: number
  readonly note: number
}

/** A name in the air; only its launch time matters here. */
interface Born {
  readonly born: number
}

/** The first note at or after `beats`. Notes are in start order. */
function firstFrom(track: RealisedTrack, beats: number): number {
  const i = track.notes.findIndex((n) => n.start >= beats)
  return i === -1 ? track.notes.length : i
}

/** Whether the music stood still, went back or leapt, rather than played on. */
export const jumped = (last: number, now: number): boolean =>
  now <= last || now - last > JUMP

/** A reader starting at `beats`, with nothing launched yet. */
export const readerAt = (
  tracks: readonly RealisedTrack[],
  beats: number,
): Reader => ({
  cursor: tracks.map((track) => firstFrom(track, beats)),
  lastLaunch: tracks.map(() => -Infinity),
})

/**
 * The notes that have started by `now` and should show their names, moving
 * the reader past them. A track launches at most one name a beat, and a muted
 * or nameless note launches nothing.
 */
export function due(
  tracks: readonly RealisedTrack[],
  names: readonly (readonly string[])[],
  muted: ReadonlySet<string>,
  reader: Reader,
  now: number,
): Launch[] {
  const out: Launch[] = []
  tracks.forEach((track, t) => {
    const quiet = muted.has(track.id)
    let i = reader.cursor[t] ?? 0
    for (; i < track.notes.length && track.notes[i]!.start <= now; i++) {
      const start = track.notes[i]!.start
      const spoke = start - (reader.lastLaunch[t] ?? -Infinity) < GAP
      if (quiet || spoke || !names[t]?.[i]) continue
      reader.lastLaunch[t] = start
      out.push({ track: t, note: i })
    }
    reader.cursor[t] = i
  })
  return out
}

/**
 * The names in the air after launching `launched` at `clock`: old ones that
 * have lived `life` milliseconds drop out, and only the newest `most` stay.
 * Returns `flying` itself when nothing changed, so React can skip a render.
 */
export function fly<T extends Born>(
  flying: readonly T[],
  launched: readonly T[],
  clock: number,
  life: number,
  most: number,
): readonly T[] {
  const alive = flying.filter((f) => clock - f.born < life)
  if (launched.length === 0 && alive.length === flying.length) return flying
  return [...alive, ...launched].slice(-most)
}
