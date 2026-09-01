import { defineConfig, type ViteUserConfig } from 'vitest/config'

/**
 * One run for the whole workspace.
 *
 * Projects rather than a flat glob so a failure names the package it came from,
 * and so a package can grow its own environment later without moving anything.
 * Tests resolve `@homelync/mocker` through the workspace `exports`, which point
 * at `src/*.ts` during development — so this runs against real source, and no
 * build is needed before `pnpm test`.
 */
// Annotated because the root config has `isolatedDeclarations` on, which cannot
// infer the type of a default-exported call expression (TS9037).
const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      'packages/*',
      // The repository's own invariants belong to no package: ADR 0011's "no
      // codedocs package reaches the network" is a fact about the workspace and
      // its dependency closure, and there is no package it could sit inside
      // without becoming a fact about that package instead.
      { test: { name: 'repo', include: ['test/**/*.test.ts'] } },
    ],
  },
})

export default config
