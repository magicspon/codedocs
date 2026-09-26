import {
  configDefaults,
  defineConfig,
  type ViteUserConfig,
} from 'vitest/config'

/**
 * One run for the whole workspace.
 *
 * Projects rather than a flat glob so a failure names the package it came from,
 * and so a package can grow its own environment later without moving anything.
 * Tests resolve `magicspon/mocker` through the workspace `exports`, which point
 * at `src/*.ts` during development — so this runs against real source, and no
 * build is needed before `pnpm test`.
 */
// Annotated because the root config has `isolatedDeclarations` on, which cannot
// infer the type of a default-exported call expression (TS9037).
const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      'packages/*',
      // The art viewer: its layouts are pure functions of an index, so they are tested
      // like any other code even though the package is never published. Its
      // `archive/` holds retired scenes kept to restore, never run.
      {
        extends: 'apps/code-art/vite.config.ts',
        test: {
          name: '@codedocs/code-art',
          root: 'apps/code-art',
          exclude: [...configDefaults.exclude, 'archive/**'],
        },
      },
      // The repository's own invariants belong to no package: ADR 0011's "no
      // codedocs package reaches the network" is a fact about the workspace and
      // its dependency closure, and there is no package it could sit inside
      // without becoming a fact about that package instead.
      { test: { name: 'repo', include: ['test/**/*.test.ts'] } },
    ],

    // Coverage belongs to the root run, not to a project: with `projects`,
    // vitest reads one coverage config and reports the workspace as a whole.
    coverage: {
      // Every source file, not only the ones a test happened to import — an
      // untested file reading 0% is the number worth seeing.
      include: [
        'packages/*/src/**/*.ts',
        'scripts/**/*.ts',
        'apps/code-art/src/lib/**/*.ts',
        'apps/code-art/scripts/read-index.ts',
      ],
      exclude: [
        // Type-only surface compiles to nothing; v8 would report it as
        // uncovered lines that no test could ever reach.
        '**/*.d.ts',
        // Fixtures are inputs the tests read, never code under test.
        '**/test/fixtures/**',
        // The `codedocs` shim: argv parsing, a call into `run`, and the exit
        // code. Importing it *is* running the CLI, so there is nothing a unit
        // test can hold; `main.ts` and `mcp.ts` behind it are covered.
        'packages/cli/src/bin.ts',
      ],
      // `lcovonly` rather than `lcov`: the latter writes a second HTML report
      // under `coverage/lcov-report`, which `html` has already produced.
      reporter: ['text', 'html', 'lcovonly'],
      // Floors, not targets — set just under the numbers the suite already
      // reaches, so a real regression fails CI while ordinary work does not
      // have to chase the last percent. Raise them when the suite earns it.
      //
      // Branches sits lower than the other three on purpose. v8 counts every
      // `??`, `?.` and defensive `catch` as a branch, and this codebase is
      // written with a lot of them — `result ?? []` in a renderer an error
      // envelope never reaches, `if (!sf) continue` inside the adapter, a guard
      // against a store row that cannot exist. Reaching those would mean
      // corrupting a store or mocking the type checker, which asserts nothing
      // about behaviour. What is left uncovered is that, not untested paths.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 75,
      },
    },
  },
})

export default config
