import { useEffect, useState } from 'react'
import type { SymbolNames } from './lib/atlas.ts'
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
 * The hover is an index into the series it came from, so it is dropped with
 * the series rather than left to point at a file in the next one. Switching
 * scenes reloads too: each scene draws its own layout of the same data.
 */
export function useSeries(dataset: string, scene: string): SeriesView {
  const [series, setSeries] = useState<Series | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    if (!dataset) return
    let live = true
    setSeries(null)
    setHovered(null)
    void loadSeries(dataset).then((s) => live && setSeries(s))
    return () => {
      live = false
    }
  }, [dataset, scene])

  return { series, hovered, setHovered }
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
 * The symbol names of the file at `path` in repository `repo`, by kind, or
 * `null` until they load (and for good when none were exported). Only called
 * once a file is picked, so nothing is read before then.
 */
export function useNames(
  repo: string,
  path: string,
): readonly (readonly string[])[] | null {
  const [names, setNames] = useState<SymbolNames | null>(null)
  useEffect(() => {
    let live = true
    void loadNames(repo).then((n) => live && setNames(n))
    return () => {
      live = false
    }
  }, [repo])
  return names?.[path] ?? null
}
