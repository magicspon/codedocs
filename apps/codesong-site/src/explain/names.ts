import type {
  Composition,
  Evidence,
  RealisedTrack,
} from '@codedocs/codesong/browser'
import { trace } from './explain.ts'

/** The last part of a path: what to show when a file's names are unknown. */
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/**
 * A name to show for every note, per track: one of the symbols its file
 * declares, or `''` for a note that stands for no single file, like a drum
 * hit. Each time a file sounds, the next of its names is shown, so a file
 * that plays often shows everything it declares rather than one name again.
 * Repositories exported without names show the file's own name instead.
 */
export function noteNames(
  composition: Composition,
  tracks: readonly RealisedTrack[],
  evidence: Evidence,
): string[][] {
  const motifs = new Map(composition.motifs.map((m) => [m.id, m]))
  const heard = new Map<string, number>()
  return tracks.map((track, t) => {
    const parts = composition.tracks[t]?.parts ?? []
    return track.notes.map((note) => {
      const motif = motifs.get(note.motif)
      const file = motif && trace(motif, parts, note).file
      if (!file) return ''
      const names = evidence.symbols?.[file] ?? []
      if (names.length === 0) return baseName(file)
      const times = heard.get(file) ?? 0
      heard.set(file, times + 1)
      return names[times % names.length]!
    })
  })
}
