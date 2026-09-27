import { hash } from '../lib/rng.ts'

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
  nextjs: {
    label: 'next.js',
    commit: '0423222b7eb3a1373b5bff4c939fd69858928993',
  },
  nuxt: {
    label: 'nuxt',
    commit: '9ceeba8c6d6a2faaded90d1fbb5efb1a8ee86945',
  },
  opencode: {
    label: 'opencode',
    commit: 'b471c2b4495747353af768fbf2e0790c9d820ce2',
  },
  payload: {
    label: 'payload',
    commit: '124b55a8747d9b45db0af30aad337569d37a9b3e',
  },
  router: {
    label: '@tanstack/router',
    commit: '763ac8b8add670ccb31887dab6509343e4827d5a',
  },
  sentry: {
    label: '@sentry/javascript',
    commit: 'bd3ce5fa6913130868e1547df810655770e3becd',
  },
  sst: {
    label: 'sst',
    commit: 'a0bd20f762883e72a35caccb4896c42ce5b3f707',
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
