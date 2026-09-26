import { useHotkey } from '@tanstack/react-hotkeys'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import { panel } from './lib/motion.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { IconToggle, SearchIcon } from './icons.tsx'
import { SearchResults } from './SearchResults.tsx'

interface SearchCornerProps {
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
  readonly files: readonly FileDatum[]
}

/** Drops down from the magnifier. */
const DROP_IN = panel({ y: -10 })

/** The search box and what it found. The box takes the cursor as it opens. */
function SearchForm(props: SearchCornerProps): JSX.Element {
  const { query, onQuery } = props
  return (
    <motion.div
      id="search"
      className="panel search-panel"
      variants={DROP_IN}
      initial="hidden"
      animate="shown"
      exit="gone"
    >
      <input
        type="search"
        placeholder="Find a file by path"
        aria-label="Find a file by path"
        value={query.text}
        onChange={(e) => onQuery({ ...query, text: e.target.value })}
        autoFocus
      />
      <SearchResults
        query={query}
        onQuery={onQuery}
        trace={props.trace}
        files={props.files}
      />
    </motion.div>
  )
}

/**
 * The galaxy's search, top left: a magnifier that opens the search form.
 * `/` opens it too; either way the cursor lands in the box.
 */
export function SearchCorner(props: SearchCornerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  useHotkey('/', () => {
    if (open) document.querySelector<HTMLInputElement>('#search input')?.focus()
    else setOpen(true)
  })
  return (
    <div className="corner left">
      <IconToggle
        open={open}
        onToggle={setOpen}
        labels={['Search (/)', 'Hide search']}
        controls="search"
      >
        <SearchIcon />
      </IconToggle>
      <AnimatePresence>{open && <SearchForm {...props} />}</AnimatePresence>
    </div>
  )
}
