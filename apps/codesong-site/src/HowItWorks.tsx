import { Link } from '@tanstack/react-router'
import type { JSX } from 'react'

/** What each part of the music comes from in the code. */
const LEGEND: readonly (readonly [string, string])[] = [
  [
    'The key',
    'How tangled the code is. Loose code plays near C major or minor',
  ],
  ['The sections', 'The main parts of the project, largest as the chorus'],
  ['The theme', 'The longest chain of files that depend on each other'],
  ['Melodies', 'Other chains of files, one note for each file'],
  ['Chords', 'Groups of files that work closely together'],
  ['Arpeggios', 'Files that depend on each other in a loop'],
  ['Drums', 'How busy each part is: denser code, busier hats'],
]

/**
 * `/how-it-works`: how a repository becomes a song, in plain words, for a
 * listener who has never used codedocs.
 */
export function HowItWorks(): JSX.Element {
  return (
    <article className="about">
      <h1>How it works</h1>
      <p>
        Each song is made from the code of one software project. Nobody wrote
        the notes. They come from how the code is built.
      </p>

      <h2>1. Read the code</h2>
      <p>
        <a href="https://github.com/magicspon/codedocs">codedocs</a> reads the
        project and records which files call or import each other. Tests and
        generated code are left out, so only code that people wrote shapes the
        song.
      </p>

      <h2>2. Measure each file</h2>
      <p>For every file, CodeSong measures:</p>
      <ul>
        <li>how many other files use it</li>
        <li>how many other files it uses</li>
        <li>how deep it sits beneath the rest of the code</li>
        <li>how central it is to the whole project</li>
      </ul>

      <h2>3. Compose</h2>
      <p>
        These measures decide the music. Rules about keys, scales and rhythm
        keep it sounding like music, while the code decides what to play.
      </p>
      <dl className="legend">
        {LEGEND.map(([part, source]) => (
          <div key={part}>
            <dt>{part}</dt>
            <dd>{source}</dd>
          </div>
        ))}
      </dl>
      <p>
        The theme comes back in every section, changed each time. Every note can
        be traced back to the files that produced it.
      </p>

      <h2>4. Play it</h2>
      <p>
        Each song page plays the piece in your browser. The bars run across a
        floor, and every note stands above its track. Pick a note to see the
        file it came from and why it sounds the way it does. Pick a section to
        see which part of the code it was built from.
      </p>
      <p>
        The same piece is also built as a set in Ableton Live, with a synth for
        each part and a 909 drum kit.
      </p>

      <h2>Same code, same song</h2>
      <p>
        Nothing is random. The same code always makes the same song, and a
        different project makes a different one. A number called a seed can make
        a variation of a song while keeping its key and shape.
      </p>

      <p>
        <Link to="/">Listen to the songs</Link>
      </p>
    </article>
  )
}
