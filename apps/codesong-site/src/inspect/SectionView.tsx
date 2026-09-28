import type { Motif } from '@codedocs/codesong/browser'
import type { JSX } from 'react'
import { motifKind, regionOf, sectionReason } from '../explain/explain.ts'
import type { ViewProps } from './Inspector.tsx'

const percent = (share: number): string => `${Math.round(share * 100)}%`

/**
 * One section: the part of the code it was built from, why it plays where it
 * does, and the motifs heard in it.
 */
export function SectionView(
  props: ViewProps & { readonly index: number },
): JSX.Element {
  const { composition, evidence } = props.score
  const section = composition.sections[props.index]
  if (!section) return <p>There is no such section.</p>
  const region = regionOf(evidence, section)
  const bar = (beats: number): number => beats / composition.beatsPerBar + 1

  // Motifs with a part that starts inside the section, in first-heard order.
  const end = section.start + section.length
  const heard = new Map<string, Motif>()
  const motifs = new Map(composition.motifs.map((m) => [m.id, m]))
  for (const part of composition.tracks
    .flatMap((t) => t.parts)
    .filter((p) => p.start >= section.start && p.start < end)
    .sort((a, b) => a.start - b.start)) {
    const motif = motifs.get(part.motif)
    if (motif) heard.set(motif.id, motif)
  }

  return (
    <>
      <h2>
        {section.name} <span className="muted">{section.form}</span>
      </h2>
      <p className="muted">
        Bars {bar(section.start)}–{bar(end) - 1}, from{' '}
        <code>{section.source}</code>
      </p>
      <ul className="reasons">
        {sectionReason(evidence, section).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {region && (
        <>
          <h3>What was measured</h3>
          <dl className="facts">
            <dt>Files</dt>
            <dd>
              {region.files.toLocaleString()} ({percent(region.share)} of the
              project)
            </dd>
            <dt>Weight</dt>
            <dd>
              {percent(region.weight)} of how much the code leans on files
            </dd>
            <dt>Links in</dt>
            <dd>{percent(region.foundation)} of links across its border</dd>
            <dt>Density</dt>
            <dd>
              {region.density.toFixed(1)} links to its own files, per file
            </dd>
            <dt>Groups</dt>
            <dd>
              {region.clusters} {region.clusters === 1 ? 'group' : 'groups'} of
              files that work together
            </dd>
            <dt>Loops</dt>
            <dd>
              {region.cycles} {region.cycles === 1 ? 'loop' : 'loops'} of files
              that depend on each other
            </dd>
          </dl>
        </>
      )}

      <h3>Heard in this section</h3>
      <ul className="picks">
        {[...heard.values()].map((motif) => (
          <li key={motif.id}>
            <button
              type="button"
              onClick={() => props.onSelect({ kind: 'motif', motif: motif.id })}
            >
              <b>{motifKind(motif)}</b>{' '}
              <span className="muted">{motif.source.files[0] ?? ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
