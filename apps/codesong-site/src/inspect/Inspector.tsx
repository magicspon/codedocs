import type { RealisedTrack, Song } from '@codedocs/codesong/browser'
import type { JSX } from 'react'
import type { NotePick } from '../scene/Notes.tsx'
import { MotifView } from './MotifView.tsx'
import { SectionView } from './SectionView.tsx'
import { SongView } from './SongView.tsx'

/** What the panel is explaining. */
export type Selection =
  | { readonly kind: 'song' }
  | { readonly kind: 'section'; readonly index: number }
  /** A motif, and the note it was picked by if it was picked in the scene. */
  | { readonly kind: 'motif'; readonly motif: string; readonly pick?: NotePick }

/** What every view in the panel is given. */
export interface ViewProps {
  readonly score: Song
  readonly tracks: readonly RealisedTrack[]
  readonly onSelect: (selection: Selection) => void
  readonly onSeek: (beats: number) => void
}

/**
 * The panel beside the scene. It starts with the whole song and what it was
 * made from; picking a section or a note in the scene narrows it to that.
 */
export function Inspector(
  props: ViewProps & { readonly selection: Selection },
): JSX.Element {
  const { selection, ...view } = props
  return (
    <aside id="song-info" className="inspector" aria-live="polite">
      {selection.kind !== 'song' && (
        <button
          type="button"
          className="back"
          onClick={() => props.onSelect({ kind: 'song' })}
        >
          ← The whole song
        </button>
      )}
      {selection.kind === 'song' && <SongView {...view} />}
      {selection.kind === 'section' && (
        <SectionView {...view} index={selection.index} />
      )}
      {selection.kind === 'motif' && (
        <MotifView {...view} motif={selection.motif} pick={selection.pick} />
      )}
    </aside>
  )
}
