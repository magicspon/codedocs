import { defineConfig } from 'vitest/config'

/**
 * One run for the whole workspace.
 *
 * Projects rather than a flat glob so a failure names the package it came from,
 * and so a package can grow its own environment later without moving anything.
 * Tests resolve `@homelync/mocker` through the workspace `exports`, which point
 * at `src/*.ts` during development — so this runs against real source, and no
 * build is needed before `pnpm test`.
 */
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
