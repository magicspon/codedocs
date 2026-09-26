import { hash, rng } from '../lib/rng.ts'

/**
 * A dataset's hue, seeded by its name so its card always glows the same
 * colour. The third draw, to keep the colours the galaxy graphic had.
 */
export function hueOf(name: string): number {
  const random = rng(hash(name))
  random()
  random()
  return Math.floor(random() * 360)
}

/**
 * A catalogue number for `name`, in the style of the New General Catalogue:
 * the short commit it was exported at, or a number seeded by its name when
 * that is not known without parsing the dataset.
 */
export function designation(name: string): string {
  const commit = SITE[name]?.commit
  return commit
    ? `NGC ${commit.slice(0, 7)}`
    : `NGC ${1000 + (hash(name) % 7000)}`
}

/**
 * The site's repositories: how each reads on its card, and the commit it was
 * exported at. Hand-kept because the commit sits inside the dataset, which the
 * landing page must not parse; re-exporting one means updating it here.
 */
const SITE: Readonly<Record<string, { label: string; commit: string }>> = {
  router: {
    label: '@tanstack/router',
    commit: '763ac8b8add670ccb31887dab6509343e4827d5a',
  },
  typescript: {
    label: 'typescript version 6 (excluding tests)',
    commit: '050880ce59e30b356b686bd3144efe24f875ebc8',
  },
  vscode: {
    label: 'vscode',
    commit: '736a3ed72ebb9533980a2470a71a78a22bd3de4d',
  },
}

/** The name shown for `dataset`, falling back to the dataset's own name. */
export function labelOf(dataset: string): string {
  return SITE[dataset]?.label ?? dataset
}
