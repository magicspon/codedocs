import { useHotkey } from '@tanstack/react-hotkeys'
import { useRef, useState, type JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { IconToggle, SearchIcon } from './icons.tsx'
import { SearchResults } from './SearchResults.tsx'

interface SearchCornerProps {
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
  readonly files: readonly FileDatum[]
}

/** The search box and what it found. */
function SearchForm(
  props: SearchCornerProps & { focus: boolean },
): JSX.Element {
  const { query, onQuery } = props
  return (
    <div id="search" className="panel search-panel">
      <input
        type="search"
        placeholder="Find a file by path"
        aria-label="Find a file by path"
        value={query.text}
        onChange={(e) => onQuery({ ...query, text: e.target.value })}
        autoFocus={props.focus}
      />
      <SearchResults
        query={query}
        onQuery={onQuery}
        trace={props.trace}
        files={props.files}
      />
    </div>
  )
}

/**
 * The galaxy's search, top left: a magnifier that opens the search form.
 * `/` opens it too and puts the cursor in the box.
 */
export function SearchCorner(props: SearchCornerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  // Only a `/` press should grab focus; a click leaves it on the canvas.
  const focus = useRef(false)
  useHotkey('/', () => {
    focus.current = true
    if (open) document.querySelector<HTMLInputElement>('#search input')?.focus()
    else setOpen(true)
  })
  const toggle = (on: boolean): void => {
    focus.current = false
    setOpen(on)
  }
  return (
    <div className="corner left">
      <IconToggle
        open={open}
        onToggle={toggle}
        labels={['Search (/)', 'Hide search']}
        controls="search"
      >
        <SearchIcon />
      </IconToggle>
      {open && <SearchForm {...props} focus={focus.current} />}
    </div>
  )
}
