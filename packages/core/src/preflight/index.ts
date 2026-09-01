/**
 * Preflight: what the filesystem says about a project before anything is opened.
 *
 * ADR 0009 splits ADR 0001's four signals in two. Signals 1-3 run first and
 * unconditionally because they cost microseconds; signal 4 falls out of
 * extraction and lives beside the adapter, with only its causing done here.
 *
 * Split by concern: `fs.ts` is the shared filesystem and JSONC primitives,
 * `tsconfig.ts` reads a `tsconfig` and its `extends` chain, `glob.ts`
 * reproduces which files a config globs (signal 3), `signals.ts` is signals 1
 * and 2 plus the lockfile facts they share with the fingerprint,
 * `fingerprint.ts` is the environment fingerprint that stops a stored fidelity
 * being a lie, `specifiers.ts` causes each unresolved specifier (signal 4), and
 * `project.ts` is `preflightProjects` and `fidelityOf` — the entry points that
 * assemble the rest.
 *
 * This file is the module's only public surface.
 */

export {
  fidelityOf,
  preflightProjects,
  type ProjectPreflight,
} from './project.ts'
export { compilerOptionsOf, lockfileName } from './signals.ts'
export { classifySpecifiers } from './specifiers.ts'
