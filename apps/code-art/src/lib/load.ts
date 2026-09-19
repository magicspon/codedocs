import type { Atlas, Timeline } from './atlas.ts'
import { fromAtlas, seriesOf, type Series } from './series.ts'

/**
 * Every export under `src/data`, loaded on demand. A module import rather than
 * a request, so the viewer holds no network code at all (ADR 0011).
 *
 * `name.json` is one index; `name.timeline.json` is a history. Both load as a
 * `Series`, so no scene has to know which it was given.
 */
const modules = import.meta.glob<{ default: Atlas | Timeline }>(
  '../data/*.json',
)

/** Dataset names, from their file names. */
export const DATASETS: readonly string[] = Object.keys(modules)
  .map((path) => path.replace(/^.*\/(.+)\.json$/, '$1'))
  .sort()

/** Loads one dataset by name. */
export async function loadSeries(name: string): Promise<Series> {
  const load = modules[`../data/${name}.json`]
  if (!load) throw new Error(`no dataset named ${name}`)
  const data = (await load()).default
  return 'frames' in data ? seriesOf(data) : fromAtlas(data)
}
