import type { JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import { traceSummary } from './lib/trace-text.ts'
import type { Trace, TraceQuery, Via } from './lib/trace.ts'

/** Matches listed; the rest are still traced, up to the cap. */
const LISTED = 6

/** The first matches, each a button that traces that file alone. */
function Matches(props: {
  trace: Trace | null
  files: readonly FileDatum[]
  onPick: (path: string) => void
}): JSX.Element | null {
  const matches = props.trace?.matches ?? []
  if (matches.length < 2) return null
  return (
    <ul className="matches">
      {matches.slice(0, LISTED).map((file) => {
        const path = props.files[file]!.path
        const cut = path.lastIndexOf('/') + 1
        return (
          <li key={file}>
            <button
              title={`Trace ${path} alone`}
              onClick={() => props.onPick(path)}
            >
              <span className="dir">{path.slice(0, cut)}</span>
              {path.slice(cut)}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The colour key, worded for the kind of link being followed. */
function Key({ via }: { via: Via }): JSX.Element {
  const run = via === 'calls' ? 'caller to callee' : 'importer to import'
  return (
    <p className="legend">
      <i className="swatch in" /> flowing in · <i className="swatch out" />{' '}
      flowing out. Light runs from {run}, one hop at a time.
    </p>
  )
}

/**
 * What the search found, under the Leva inputs that drive it. Leva has no
 * list or rich-text input, so this part stays plain HTML.
 */
export function SearchResults(props: {
  query: TraceQuery
  onQuery: (query: TraceQuery) => void
  trace: Trace | null
  files: readonly FileDatum[]
}): JSX.Element {
  const { query, onQuery, trace } = props
  return (
    <div className="search">
      <p className="meta">{traceSummary(query, trace)}</p>
      <Matches
        trace={trace}
        files={props.files}
        onPick={(text) => onQuery({ ...query, text })}
      />
      <Key via={query.via} />
    </div>
  )
}
