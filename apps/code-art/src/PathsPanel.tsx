import { useEffect, useRef, type JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import type { Side } from './lib/paths.ts'
import type { Via } from './lib/trace.ts'
import type { PathNav } from './usePathKeys.ts'

/** What each side is called, per kind of link. */
const HEADINGS: Record<Via, Record<Side, string>> = {
  calls: { in: 'Callers', out: 'Callees' },
  imports: { in: 'Importers', out: 'Imports' },
}

/** One side's files, the cursor's row marked and kept in view. */
function SideList(props: {
  side: Side
  heading: string
  files: readonly number[]
  names: readonly FileDatum[]
  /** The cursor's row on this side, or `-1` when the cursor is on the other. */
  at: number
  onPick: (path: string) => void
}): JSX.Element {
  const row = useRef<HTMLLIElement>(null)
  // Braced: newer browsers return a promise from `scrollIntoView`, which React
  // would take for a clean-up.
  useEffect(() => {
    row.current?.scrollIntoView({ block: 'nearest' })
  }, [props.at])
  return (
    <section data-side={props.side}>
      <h3>
        {props.heading} <span className="count">{props.files.length}</span>
      </h3>
      <ul className="matches">
        {props.files.map((file, i) => {
          const path = props.names[file]!.path
          return (
            <li
              key={file}
              ref={i === props.at ? row : undefined}
              aria-current={i === props.at || undefined}
            >
              <button title={path} onClick={() => props.onPick(path)}>
                {path.slice(path.lastIndexOf('/') + 1)}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The selected file's direct links, walked with the arrow keys. */
export function PathsPanel(props: {
  nav: PathNav
  via: Via
  files: readonly FileDatum[]
  onPick: (path: string) => void
}): JSX.Element | null {
  const { paths, cursor, back } = props.nav
  if (paths.in.length + paths.out.length === 0) return null
  const headings = HEADINGS[props.via]
  const sides = (['in', 'out'] as const).filter((s) => paths[s].length > 0)
  return (
    <div className="panel paths">
      <div className="sides">
        {sides.map((side) => (
          <SideList
            key={side}
            side={side}
            heading={headings[side]}
            files={paths[side]}
            names={props.files}
            at={cursor.side === side ? cursor.index : -1}
            onPick={props.onPick}
          />
        ))}
      </div>
      <p className="legend">
        ↑↓ choose · ←→ {headings.in.toLowerCase()} or{' '}
        {headings.out.toLowerCase()} · Enter follow
        {back && ' · Backspace back'} · Esc clear
      </p>
    </div>
  )
}
