import type { JSX } from 'react'
import { keyName, keyReason } from '../explain/explain.ts'
import { FORM_COLOUR, ROLE_COLOUR } from '../scene/layout.ts'
import type { ViewProps } from './Inspector.tsx'

/** What each track plays, and what in the code it comes from. */
const ROLE_SOURCE: Readonly<Record<string, string>> = {
  lead: 'the theme and melodies, from chains of files',
  counter: 'melodies from each part’s own chains of files',
  bass: 'the roots of the chords',
  pad: 'chords, from groups of files that work together',
  arp: 'loops of files that depend on each other',
  percussion: 'how busy each part of the code is',
}

/**
 * The whole song: which code it came from, the settings it was composed
 * with, and the key and sections the code chose.
 */
export function SongView({
  score,
  tracks,
  onSelect,
  onSeek,
}: ViewProps): JSX.Element {
  const { composition, evidence } = score
  const { origin } = composition
  return (
    <>
      <h2>Made from {origin.repository}</h2>
      <p className="muted">
        {evidence.files.toLocaleString()} source files at commit{' '}
        <code>{origin.commit.slice(0, 7)}</code>. Tests and generated files are
        left out.
      </p>

      <h3>Key: {keyName(composition)}</h3>
      <p>{keyReason(score)}</p>

      <h3>Settings</h3>
      <dl className="facts">
        <dt>Tempo</dt>
        <dd>{composition.tempo} beats a minute</dd>
        <dt>Scale</dt>
        <dd>{composition.scale}</dd>
        <dt>Seed</dt>
        <dd>
          {origin.options.seed}{' '}
          <span className="muted">
            (changes details, never the key or shape)
          </span>
        </dd>
        <dt>Composer</dt>
        <dd>version {composition.composerVersion}</dd>
      </dl>

      <h3>Sections</h3>
      <p className="muted">
        Each section is one part of the code. Pick one to see why it is where it
        is.
      </p>
      <ol className="picks">
        {composition.sections.map((section, index) => (
          <li key={section.start}>
            <button
              type="button"
              onClick={() => {
                onSelect({ kind: 'section', index })
                onSeek(section.start)
              }}
            >
              <i style={{ background: FORM_COLOUR[section.form] }} />
              <b>{section.name}</b>{' '}
              <span className="muted">{section.form}</span>
              <span className="muted right">
                bar {section.start / composition.beatsPerBar + 1}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <h3>Tracks</h3>
      <dl className="facts">
        {tracks.map((track) => (
          <div key={track.id}>
            <dt style={{ color: ROLE_COLOUR[track.role] }}>{track.name}</dt>
            <dd>{ROLE_SOURCE[track.role]}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Pick any note in the scene to see the files it came from.
      </p>
    </>
  )
}
