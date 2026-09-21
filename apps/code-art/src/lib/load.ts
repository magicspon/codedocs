import type { Atlas, Timeline } from './atlas.ts'
import { fromAtlas, seriesOf, type Series } from './series.ts'

/** One dataset, however it reached the page. */
type Load = () => Promise<Atlas | Timeline>

/**
 * Datasets `codedocs art` wrote into the page, as
 * `<script type="application/json" data-dataset="name">`. Parsed only when
 * opened: a timeline can run to tens of MB.
 */
function embedded(): Record<string, Load> {
  const blocks = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-dataset]',
  )
  return Object.fromEntries(
    [...blocks].map((block) => [
      block.dataset.dataset ?? '',
      () => Promise.resolve(JSON.parse(block.textContent) as Atlas | Timeline),
    ]),
  )
}

/**
 * Every dataset the viewer can open. Inline JSON or a module import rather
 * than a request, so the viewer holds no network code at all (ADR 0011).
 *
 * `name.json` is one index; `name.timeline.json` is a history. Both load as a
 * `Series`, so no scene has to know which it was given. The `embed` build
 * drops the glob, so no dev export is bundled into the page the CLI ships.
 */
function sources(): Record<string, Load> {
  if (import.meta.env.MODE === 'embed') return embedded()
  // Symbol names are not a dataset; `names.ts` loads them on demand.
  const modules = import.meta.glob<{ default: Atlas | Timeline }>([
    '../data/*.json',
    '!../data/*.symbols.json',
  ])
  return Object.fromEntries(
    Object.entries(modules).map(([path, load]) => [
      path.replace(/^.*\/(.+)\.json$/, '$1'),
      async () => (await load()).default,
    ]),
  )
}

const loaders = sources()

/** Dataset names, sorted. */
export const DATASETS: readonly string[] = Object.keys(loaders).sort()

/** Loads one dataset by name. */
export async function loadSeries(name: string): Promise<Series> {
  const load = loaders[name]
  if (!load) throw new Error(`no dataset named ${name}`)
  const data = await load()
  return 'frames' in data ? seriesOf(data) : fromAtlas(data)
}
