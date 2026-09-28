import type { JSX } from 'react'
import { motifKind, motifReason, transformReason } from '../explain/explain.ts'
import type { NotePick } from '../scene/Notes.tsx'
import type { ViewProps } from './Inspector.tsx'
import { picked, ThisNote } from './ThisNote.tsx'

/**
 * One motif: what kind of structure it came from, the files it names in the
 * order it plays them, and, when a note was picked, which file that note is
 * and why it sounds as it does.
 */
export function MotifView(
  props: ViewProps & { readonly motif: string; readonly pick?: NotePick },
): JSX.Element {
  const { composition, evidence } = props.score
  const motif = composition.motifs.find((m) => m.id === props.motif)
  if (!motif) return <p>There is no such motif.</p>

  const bar = (beats: number): number =>
    Math.floor(beats / composition.beatsPerBar) + 1
  const { tracks, pick } = props
  const note = pick && { composition, evidence, tracks, motif, pick }
  const traced = note && picked(note)
  const file = traced?.file
  const played = composition.tracks.flatMap((t) =>
    t.parts
      .filter((p) => p.motif === motif.id)
      .map((p) => ({ track: t.name, part: p })),
  )

  return (
    <>
      <h2>
        {motifKind(motif)}{' '}
        {motif.source.subsystem && (
          <span className="muted">from {motif.source.subsystem}</span>
        )}
      </h2>
      <p>{motifReason(motif)}</p>

      {note && traced && <ThisNote {...note} traced={traced} />}

      <h3>Files, in the order they play</h3>
      <ol className="files">
        {motif.source.files.map((path) => {
          const m = evidence.measures[path]
          return (
            <li key={path} className={path === file ? 'current' : undefined}>
              <code>{path}</code>
              {m && (
                <span className="muted">
                  used by {m.fanIn} · uses {m.fanOut} · depth {m.depth}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {motifKind(motif) === 'groove' && (
        <p className="muted">Only the first few of these files are named.</p>
      )}

      <h3>Where it plays</h3>
      <ul className="picks">
        {played.map(({ track, part }) => (
          <li key={`${track}:${part.start}`}>
            <button type="button" onClick={() => props.onSeek(part.start)}>
              <b>bar {bar(part.start)}</b>{' '}
              <span className="muted">{track}</span>
              <span className="muted right">
                {transformReason(part) ?? 'as written'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
