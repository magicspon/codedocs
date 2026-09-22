import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FileSymbols } from './lib/atlas.ts'
import { DATASETS, loadSeries } from './lib/load.ts'
import { loadNames } from './lib/names.ts'
import type { Series } from './lib/series.ts'
import type { Direction, TraceQuery } from './lib/trace.ts'

/** Reads `?data=…&scene=…&lens=health&q=…` so a view can be bookmarked. */
export function initial(key: string, fallback: string): string {
  return new URLSearchParams(location.search).get(key) ?? fallback
}

/** The dataset to open: whatever the URL asks for, else the first exported. */
export function initialDataset(): string {
  return initial('data', DATASETS[0] ?? '')
}

/** The search to open with: `?q=` from the URL, traced both ways, two hops deep. */
export function initialQuery(): TraceQuery {
  const flow = initial('flow', 'both')
  return {
    text: initial('q', ''),
    direction: (['in', 'out', 'both'].includes(flow)
      ? flow
      : 'both') as Direction,
    via: initial('via', 'calls') === 'imports' ? 'imports' : 'calls',
    depth: 2,
  }
}

/** A loaded series and the file hovered inside it. */
export interface SeriesView {
  /** Null while loading, and between datasets. */
  readonly series: Series | null
  /** An index into `series.merged.files`. */
  readonly hovered: number | null
  readonly setHovered: (index: number | null) => void
}

/**
 * Loads a dataset, and holds what the pointer is over in it.
 *
 * A loaded dataset stays cached, so switching back to it is instant; each
 * scene still lays it out afresh. The hover is an index into the series it
 * came from, so it is kept against the view it was made in and dropped when
 * the dataset or scene changes, rather than left to point at another file.
 */
export function useSeries(dataset: string, scene: string): SeriesView {
  const { data } = useQuery({
    queryKey: ['series', dataset],
    queryFn: () => loadSeries(dataset),
    enabled: dataset !== '',
  })
  const view = `${dataset}/${scene}`
  const [held, setHeld] = useState<{ view: string; index: number | null }>({
    view,
    index: null,
  })
  return {
    series: data ?? null,
    hovered: held.view === view ? held.index : null,
    setHovered: (index) => setHeld({ view, index }),
  }
}

/** Keeps the URL in step with the view, so the address bar is always shareable. */
export function useBookmark(
  dataset: string,
  scene: string,
  lens: boolean,
  search: string,
): void {
  useEffect(() => {
    if (!dataset) return
    let query = `?data=${encodeURIComponent(dataset)}&scene=${scene}`
    if (lens) query += '&lens=health'
    if (search.trim()) query += `&q=${encodeURIComponent(search.trim())}`
    history.replaceState(null, '', query)
  }, [dataset, scene, lens, search])
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
