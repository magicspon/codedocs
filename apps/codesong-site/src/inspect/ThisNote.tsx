import type {
  Composition,
  Evidence,
  Motif,
  RealisedTrack,
} from '@codedocs/codesong/browser'
import type { JSX } from 'react'
import {
  noteReason,
  trace,
  transformReason,
  type Trace,
} from '../explain/explain.ts'
import type { NotePick } from '../scene/Notes.tsx'

interface Props {
  readonly composition: Composition
  readonly evidence: Evidence
  readonly tracks: readonly RealisedTrack[]
  readonly motif: Motif
  readonly pick: NotePick
}

/** The note picked in the scene, traced back to its part, place and file. */
export function picked(props: Props): Trace | undefined {
  const { composition, tracks, motif, pick } = props
  const note = tracks.find((t) => t.id === pick.track)?.notes[pick.index]
  const track = composition.tracks.find((t) => t.id === pick.track)
  return note && track ? trace(motif, track.parts, note) : undefined
}

/**
 * One picked note: when it plays, which file it stands for, why it has its
 * pitch, length and loudness, and how its part changed the motif.
 */
export function ThisNote(
  props: Props & { readonly traced: Trace },
): JSX.Element {
  const { composition, evidence, motif, pick, traced } = props
  const measures = traced.file ? evidence.measures[traced.file] : undefined
  const changed = traced.part ? transformReason(traced.part) : undefined
  const symbols = (traced.file && evidence.symbols?.[traced.file]) || []
  const bar = Math.floor(traced.note.start / composition.beatsPerBar) + 1
  return (
    <section className="note">
      <h3>This note</h3>
      <p className="muted">
        Bar {bar}, on the {pick.track} track
      </p>
      {traced.file && (
        <p>
          It stands for <code>{traced.file}</code>.
        </p>
      )}
      {symbols.length > 0 && (
        <p className="muted">
          It declares <code>{symbols.join(', ')}</code>.
        </p>
      )}
      {measures && (
        <ul className="reasons">
          {noteReason(motif, traced.index, measures).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {changed && <p className="muted">{changed}</p>}
    </section>
  )
}
