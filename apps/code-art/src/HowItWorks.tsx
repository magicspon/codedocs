import { Link } from '@tanstack/react-router'
import type { JSX } from 'react'
import { Starfield } from './landing/Starfield.tsx'
import './landing/landing.css'
import './landing/about.css'

/** What each part of a galaxy stands for in the code. */
const LEGEND: readonly (readonly [string, string])[] = [
  ['A spiral arm', 'A folder'],
  ['A cluster of stars', 'A file, with one star for each symbol in it'],
  ['The colour of a star', 'The kind of symbol: function, class, type…'],
  [
    'Dust lanes',
    'Calls between files. The most-called files sit near the core',
  ],
  ['Faint red haze', 'Calls that codedocs could not follow to their target'],
  ['A black hole', 'A test file'],
]

/**
 * `/how-it-works`: how a repository becomes a galaxy, in plain words, for a
 * visitor who has never used codedocs.
 */
export function HowItWorks(): JSX.Element {
  return (
    <>
      <Starfield />
      <main className="landing">
        <header className="landing-head">
          <h1>How it works</h1>
          <p className="intro">
            Each galaxy is drawn from the code of one software project. Every
            shape stands for something real in that code.
          </p>
        </header>

        <article className="about">
          <section>
            <h2>1. Read the code</h2>
            <p>
              The tool reads the project and records every file, every symbol in
              it (functions, classes, types and so on), and which symbols call
              or import each other.
            </p>
          </section>

          <section>
            <h2>2. Draw the facts</h2>
            <p>
              The art turns those records into a galaxy. Nothing is placed at
              random, so the same code always draws the same galaxy.
            </p>
            <dl className="legend">
              {LEGEND.map(([shape, meaning]) => (
                <div key={shape}>
                  <dt>{shape}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2>3. Follow a file</h2>
            <p>
              Click a file, or press <kbd>/</kbd> and type part of its name. The
              rest of the galaxy goes dark and light runs along its links: blue
              for the code that calls it, amber for the code it calls. Its
              symbols move out from it as planets, one orbit for each kind.
            </p>
            <ul>
              <li>
                Press <kbd>F</kbd> to fly the camera yourself.
              </li>
              <li>
                Press <kbd>O</kbd> to hide or show the orbits.
              </li>
              <li>Drag to turn the view. Scroll to zoom.</li>
            </ul>
          </section>

          <section>
            <h2>4. Watch it change</h2>
            <p>
              Some galaxies are timelines. They replay the project&rsquo;s
              history one commit at a time, so you can watch files appear and
              grow. Some also show code health: files that change often and are
              hard to read flare from orange to white.
            </p>
          </section>
        </article>

        <Link to="/" className="about-back">
          See the galaxies
        </Link>
      </main>
    </>
  )
}
