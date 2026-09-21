import { useEffect, useRef, type JSX, type RefObject } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import { hopCount, traceSummary } from './lib/trace-text.ts'
import type { Direction, Trace, TraceQuery, Via } from './lib/trace.ts'

/** Matches listed under the box; the rest are still traced, up to the cap. */
const LISTED = 6

/** What each direction is called, per kind of link, in words a reader uses. */
const DIRECTIONS: Record<Via, readonly [Direction, string][]> = {
  calls: [
    ['in', 'Callers'],
    ['both', 'Both'],
    ['out', 'Callees'],
  ],
  imports: [
    ['in', 'Importers'],
    ['both', 'Both'],
    ['out', 'Imports'],
  ],
}

function Tabs<T extends string>(props: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="tabs" role="tablist" aria-label={props.label}>
      {props.options.map(([value, text]) => (
        <button
          key={value}
          role="tab"
          aria-selected={value === props.value}
          onClick={() => props.onChange(value)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** `/` anywhere but a text box jumps to the search. */
function useSlashKey(box: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.target instanceof HTMLInputElement) return
      e.preventDefault()
      box.current?.focus()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [box])
}

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
    <p className="legend key">
      <i className="swatch in" /> flowing in · <i className="swatch out" />{' '}
      flowing out. Light runs from {run}, one hop at a time.
    </p>
  )
}

/**
 * Search and trace: find files by path, then watch the calls or imports flow
 * into and out of them. `/` jumps to the box and Escape clears it.
 */
export function Search(props: {
  query: TraceQuery
  onQuery: (query: TraceQuery) => void
  trace: Trace | null
  files: readonly FileDatum[]
}): JSX.Element {
  const { query, onQuery, trace } = props
  const box = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<TraceQuery>): void =>
    onQuery({ ...query, ...patch })
  useSlashKey(box)

  return (
    <div className="panel search">
      <input
        ref={box}
        className="search-box"
        type="search"
        value={query.text}
        placeholder="Search files to trace  ( / )"
        aria-label="Search files to trace"
        spellCheck={false}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={(e) => e.key === 'Escape' && set({ text: '' })}
      />
      <p className="meta">{traceSummary(query, trace)}</p>
      <Matches
        trace={trace}
        files={props.files}
        onPick={(text) => set({ text })}
      />
      <Tabs
        label="Links to follow"
        options={[
          ['calls', 'Calls'],
          ['imports', 'Imports'],
        ]}
        value={query.via}
        onChange={(via) => set({ via })}
      />
      <Tabs
        label="Direction"
        options={DIRECTIONS[query.via]}
        value={query.direction}
        onChange={(direction) => set({ direction })}
      />
      <label className="depth">
        <span>{hopCount(query.depth)}</span>
        <input
          type="range"
          min={1}
          max={4}
          value={query.depth}
          onChange={(e) => set({ depth: Number(e.target.value) })}
        />
      </label>
      <Key via={query.via} />
    </div>
  )
}
