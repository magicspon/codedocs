import type { RealisedTrack } from '@codedocs/codesong/browser'
import type { NotePick } from '../scene/Notes.tsx'
import type { Selection } from './Inspector.tsx'

/** The motif a picked or hovered note plays, if the pick lands on a note. */
export const motifAt = (
  tracks: readonly RealisedTrack[],
  pick: NotePick | undefined,
): string | undefined =>
  pick && tracks.find((t) => t.id === pick.track)?.notes[pick.index]?.motif

/** What picking a note selects: its motif, remembering the note. */
export function pickNote(
  tracks: readonly RealisedTrack[],
  pick: NotePick,
): Selection | undefined {
  const motif = motifAt(tracks, pick)
  return motif === undefined ? undefined : { kind: 'motif', motif, pick }
}

/** What the scene lights up for the panel's selection and the note under the pointer. */
export interface Highlight {
  /** The hovered note's motif, else the selected one. */
  readonly motif: string | undefined
  readonly picked: NotePick | undefined
  readonly section: number | undefined
}

/** The scene's highlight: hovering a note wins over what the panel shows. */
export function highlight(
  tracks: readonly RealisedTrack[],
  hover: NotePick | undefined,
  selection: Selection,
): Highlight {
  const motif = selection.kind === 'motif' ? selection : undefined
  return {
    motif: motifAt(tracks, hover) ?? motif?.motif,
    picked: motif?.pick,
    section: selection.kind === 'section' ? selection.index : undefined,
  }
}
