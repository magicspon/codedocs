import { useHotkeys } from '@tanstack/react-hotkeys'
import { useMemo, useState } from 'react'
import { detailFile, hoveredFile } from './lib/frame.ts'
import {
  cursorFile,
  firstCursor,
  moveCursor,
  pathsOf,
  type Move,
  type PathCursor,
  type Paths,
} from './lib/paths.ts'
import type { Series } from './lib/series.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'

/** The keyboard walk from the selected file, for the panel and the scene. */
export interface PathNav {
  /** The selected file, or `null` when the search is not one file. */
  readonly selected: number | null
  readonly paths: Paths
  readonly cursor: PathCursor
  /** The file under the cursor, or `null` with nowhere to go. */
  readonly aim: number | null
  /** The path Backspace returns to, or `null` at the start of the walk. */
  readonly back: string | null
  /** Selects `path`, remembering the current selection for Backspace. */
  readonly follow: (path: string) => void
}

const NO_PATHS: Paths = { in: [], out: [] }

/** Arrow keys, by the cursor move each makes. */
const ARROWS = [
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
] as const satisfies readonly (readonly [string, Move])[]

/**
 * Walks the selected file's links by keyboard. The arrows move a cursor over
 * its callers (left) and callees (right); Enter selects the file under it,
 * Backspace steps back, Escape clears the selection and the walk.
 */
export function usePathKeys(
  series: Series | null,
  frame: number,
  query: TraceQuery,
  trace: Trace | null,
  onQuery: (query: TraceQuery) => void,
): PathNav {
  const selected = detailFile(null, trace?.matches)
  const paths = useMemo(() => {
    if (!series || selected === null) return NO_PATHS
    const links =
      query.via === 'calls' ? series.merged.calls : series.merged.imports
    const present = (f: number): boolean => !!hoveredFile(series, frame, f)
    return pathsOf(links, selected, query.direction, present)
  }, [series, frame, selected, query.via, query.direction])

  // The cursor is kept against the file it was moved for, so a new selection
  // starts fresh instead of inheriting a place in another file's lists.
  const [held, setHeld] = useState<{ file: number | null; at: PathCursor }>({
    file: null,
    at: firstCursor(NO_PATHS),
  })
  const cursor =
    held.file === selected && cursorFile(paths, held.at) !== null
      ? held.at
      : firstCursor(paths)
  const aim = cursorFile(paths, cursor)
  const [trail, setTrail] = useState<readonly string[]>([])

  const select = (text: string): void => onQuery({ ...query, text })
  const follow = (path: string): void => {
    setTrail((t) => [...t, query.text])
    select(path)
  }
  const on = selected !== null
  useHotkeys([
    ...ARROWS.map(([hotkey, move]) => ({
      hotkey,
      callback: () =>
        setHeld({ file: selected, at: moveCursor(paths, cursor, move) }),
      options: { enabled: on },
    })),
    {
      hotkey: 'Enter',
      callback: () => {
        if (series && aim !== null) follow(series.merged.files[aim]!.path)
      },
      options: { enabled: on },
    },
    {
      hotkey: 'Backspace',
      callback: () => {
        const last = trail.at(-1)
        if (last === undefined) return
        setTrail(trail.slice(0, -1))
        select(last)
      },
      options: { enabled: trail.length > 0 },
    },
    {
      // Fires in the search box too, where it has always cleared the search.
      hotkey: 'Escape',
      callback: () => {
        setTrail([])
        select('')
      },
    },
  ])

  return { selected, paths, cursor, aim, back: trail.at(-1) ?? null, follow }
}
