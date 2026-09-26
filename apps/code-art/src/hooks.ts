import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FileSymbols } from './lib/atlas.ts'
import { loadNames } from './lib/names.ts'
import type { TraceQuery } from './lib/trace.ts'
import { searchOf } from './search.ts'

/** The file hovered in the current view. */
export interface HoverView {
  /** An index into the series' `merged.files`. */
  readonly hovered: number | null
  readonly setHovered: (index: number | null) => void
}

/**
 * Holds what the pointer is over in `view` (a dataset and scene). The hover
 * is an index into the series it came from, so it is kept against the view it
 * was made in and dropped when the view changes, rather than left to point at
 * another file.
 */
export function useHover(view: string): HoverView {
  const [held, setHeld] = useState<{ view: string; index: number | null }>({
    view,
    index: null,
  })
  return {
    hovered: held.view === view ? held.index : null,
    // The pointer moves far more often than it changes file; an unchanged
    // hover keeps the same state, or every move re-renders the whole scene.
    setHovered: (index) =>
      setHeld((h) =>
        h.view === view && h.index === index ? h : { view, index },
      ),
  }
}

/** Keeps the URL in step with the view, so the address bar is always shareable. */
export function useBookmark(view: {
  scene: string
  lens: boolean
  isolate: boolean
  query: TraceQuery
}): void {
  const navigate = useNavigate({ from: '/$dataset' })
  const search = searchOf(view)
  const key = JSON.stringify(search)
  useEffect(() => {
    // Replaced, not pushed: Back leaves the art rather than undoing a keystroke.
    void navigate({ search, replace: true })
    // `key` stands for `search`, which is a new object every render.
  }, [navigate, key])
}

/**
 * The symbols of the file at `path` in repository `repo`: `undefined` while
 * they load, `null` for good when none were exported. Only called once a file
 * is picked, so nothing is read before then.
 */
export function useSymbols(
  repo: string,
  path: string,
): FileSymbols | null | undefined {
  const { data, isPending } = useQuery({
    queryKey: ['names', repo],
    queryFn: () => loadNames(repo),
    // One parse per repository, kept for the session: they can be large.
    gcTime: Infinity,
  })
  if (isPending) return undefined
  return data?.[path] ?? null
}
