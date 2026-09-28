import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { useEffect, useState } from 'react'
import type { NotePick } from '../scene/Notes.tsx'
import type { Selection } from './Inspector.tsx'
import { highlight, pickNote, type Highlight } from './select.ts'

/** What the song page is looking at: the panel, the note under the pointer and the open synth. */
export interface SongSelection {
  /** Whether the details panel is open. */
  readonly info: boolean
  readonly setInfo: (open: boolean) => void
  readonly selection: Selection
  readonly setSelection: (selection: Selection) => void
  readonly setHover: (pick: NotePick | undefined) => void
  readonly highlight: Highlight
  /** Picking a note or a section asks what it is, so each opens the panel. */
  readonly pick: (pick: NotePick) => void
  readonly section: (index: number) => void
  /** The track whose synth settings are open. */
  readonly tuning: string | undefined
  /** Opens a track's synth settings, or closes them if they are open. */
  readonly tune: (track: string) => void
  readonly closeTuning: () => void
}

/**
 * The song page's selection state. A new song starts on the whole song with
 * no synth open; the details stay hidden until asked for, so the score has
 * the whole window.
 */
export function useSelection(
  composition: Composition,
  tracks: readonly RealisedTrack[],
): SongSelection {
  const [info, setInfo] = useState(false)
  const [hover, setHover] = useState<NotePick>()
  const [selection, setSelection] = useState<Selection>({ kind: 'song' })
  const [tuning, setTuning] = useState<string>()

  useEffect(() => {
    setSelection({ kind: 'song' })
    setTuning(undefined)
  }, [composition])

  const show = (next: Selection | undefined): void => {
    if (!next) return
    setSelection(next)
    setInfo(true)
  }

  return {
    info,
    setInfo,
    selection,
    setSelection,
    setHover,
    highlight: highlight(tracks, hover, selection),
    pick: (p) => show(pickNote(tracks, p)),
    section: (index) => show({ kind: 'section', index }),
    tuning,
    tune: (track) => setTuning((open) => (open === track ? undefined : track)),
    closeTuning: () => setTuning(undefined),
  }
}
