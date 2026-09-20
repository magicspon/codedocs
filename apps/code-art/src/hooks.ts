import { useEffect, useState } from 'react'
import { DATASETS, loadSeries } from './lib/load.ts'
import type { Series } from './lib/series.ts'

/** Reads `?data=…&scene=…&lens=health` so a view can be bookmarked. */
export function initial(key: string, fallback: string): string {
  return new URLSearchParams(location.search).get(key) ?? fallback
}

/** The dataset to open: whatever the URL asks for, else the first exported. */
export function initialDataset(): string {
  return initial('data', DATASETS[0] ?? '')
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
): void {
  useEffect(() => {
    if (!dataset) return
    const query = `?data=${encodeURIComponent(dataset)}&scene=${scene}`
    history.replaceState(null, '', lens ? `${query}&lens=health` : query)
  }, [dataset, scene, lens])
}
