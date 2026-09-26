import { getRouteApi, Link } from '@tanstack/react-router'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { DATASETS } from './lib/load.ts'
import { designation, hueOf, labelOf } from './landing/identity.ts'
import { Starfield } from './landing/Starfield.tsx'
import './landing/landing.css'

/** The datasets to open, each as a card glowing in its own colour. */
function Galaxies(): JSX.Element {
  return (
    <ul className="galaxies">
      {DATASETS.map((dataset) => (
        <li key={dataset} style={{ '--hue': hueOf(dataset) } as CSSProperties}>
          <Link to="/$dataset" params={{ dataset }}>
            <span className="galaxy-name">{labelOf(dataset)}</span>
            <span className="galaxy-id">{designation(dataset)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The sky and the scrolling column every landing view sits in. */
function Shell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <Starfield />
      <main className="landing">{children}</main>
    </>
  )
}

/**
 * Shown at `/`: a link to each dataset's galaxy, or how to export one when
 * there are none. Nothing opens until one is picked, so no dataset is parsed
 * that was not asked for.
 */
export function Landing(): JSX.Element {
  if (DATASETS.length === 0)
    return (
      <Shell>
        <header className="landing-head">
          <h1>No data yet</h1>
          <p className="intro">
            Run{' '}
            <code>pnpm --filter @codedocs/code-art export &lt;repo&gt;</code>{' '}
            and reload.
          </p>
        </header>
      </Shell>
    )
  return (
    <Shell>
      <header className="landing-head">
        <h1>Every codebase is a galaxy</h1>
      </header>
      <Galaxies />
    </Shell>
  )
}

const route = getRouteApi('/$dataset')

/** Shown for a path naming a dataset this build does not hold. */
export function UnknownDataset(): JSX.Element {
  const { dataset } = route.useParams()
  return (
    <Shell>
      <header className="landing-head">
        <h1>No galaxy named {dataset}</h1>
        <p className="intro">Pick one of these instead.</p>
      </header>
      <Galaxies />
    </Shell>
  )
}
