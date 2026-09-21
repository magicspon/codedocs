import type { SymbolNames } from './atlas.ts'

/**
 * A repository's symbol names, loaded the first time a file is picked and
 * never before: they can outweigh the dataset itself. Inline JSON in the page
 * `codedocs art` writes, a lazily imported module in the dev viewer; neither
 * is a request (ADR 0011).
 */

type Load = () => Promise<SymbolNames>

/** Blocks `codedocs art` wrote, as `<script type="application/json" data-symbols="repo">`. */
function embedded(): Record<string, Load> {
  const blocks = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-symbols]',
  )
  return Object.fromEntries(
    [...blocks].map((block) => [
      block.dataset.symbols ?? '',
      () => Promise.resolve(JSON.parse(block.textContent) as SymbolNames),
    ]),
  )
}

function sources(): Record<string, Load> {
  if (import.meta.env.MODE === 'embed') return embedded()
  const modules = import.meta.glob<{ default: SymbolNames }>(
    '../data/*.symbols.json',
  )
  return Object.fromEntries(
    Object.entries(modules).map(([path, load]) => [
      path.replace(/^.*\/(.+)\.symbols\.json$/, '$1'),
      async () => (await load()).default,
    ]),
  )
}

const loaders = sources()

/**
 * The names for the repository `repo` (an atlas's `name`), or `null` when
 * none were exported with it, as for a dataset written before names were.
 * Uncached: the caller's query keeps one parse per repository.
 */
export function loadNames(repo: string): Promise<SymbolNames | null> {
  const load = loaders[repo]
  return load ? load().catch(() => null) : Promise.resolve(null)
}
