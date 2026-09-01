/**
 * Preflight: what the filesystem says about a project before anything is opened.
 *
 * ADR 0009 splits ADR 0001's four signals in two. Signals 1-3 are this module —
 * `node_modules`, a declared `postinstall`, and whether the config's includes
 * match any file — and they run first and unconditionally because they cost
 * microseconds. Signal 4 falls out of extraction and is not here.
 *
 * The module also computes the **environment fingerprint**, which is what stops
 * a stored fidelity being a lie. Fidelity is stored with the facts it describes
 * and never recomputed at query time, so without a fingerprint an index built
 * over a fresh clone would keep answering `typed` the moment an install landed —
 * or worse, keep answering `syntactic` for ever, which is the shipped defect this
 * module closes.
 *
 * Nothing here walks `node_modules`, and nothing here opens a TypeScript program.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Fidelity, FilePath, PreconditionCause } from '../model.ts'
import { fingerprintOf } from './fingerprint.ts'
import { globbedFiles } from './glob.ts'
import {
  declaresInstallScript,
  hasNodeModules,
  lockfileHash,
} from './signals.ts'
import { readConfig } from './tsconfig.ts'

/** What preflight measured about one project. Every field is filesystem-cheap. */
export interface ProjectPreflight {
  readonly configPath: FilePath
  /**
   * The environment fingerprint: lockfile hash, `compilerOptions`, and the count
   * and set-hash of the files the config globs. Part of the cache key, so a
   * project whose fingerprint moved is re-analysed rather than served from the
   * index.
   */
  readonly fingerprint: string
  /** Whether the config file itself is still on disk. */
  readonly present: boolean
  /** Signal 1: a `node_modules` at or above the project's own directory. */
  readonly installed: boolean
  /** Signal 2: an install script declared in the nearest `package.json`. */
  readonly postinstall: boolean
  /** Signal 3: the files the config globs. Empty is the signal. */
  readonly globbed: readonly FilePath[]
}

/**
 * Preflight every project, over the file list the drift walk already produced.
 *
 * The walk is shared rather than repeated: signal 3 needs the tree's files, and
 * ADR 0004's drift detection has just enumerated them.
 */
export function preflightProjects(
  root: string,
  configPaths: readonly FilePath[],
  seenFiles: readonly FilePath[],
): Map<FilePath, ProjectPreflight> {
  // One hash per lockfile rather than one per project: a monorepo's 34 projects
  // share a single lockfile, and cal.com's is 1.3 MB.
  const lockfiles = new Map<string, string>()
  const found = new Map<FilePath, ProjectPreflight>()
  for (const configPath of configPaths) {
    found.set(
      configPath,
      preflightProject(root, configPath, seenFiles, lockfiles),
    )
  }
  return found
}

/** Preflight one project. See `preflightProjects` for the shared-walk argument. */
function preflightProject(
  root: string,
  configPath: FilePath,
  seenFiles: readonly FilePath[],
  lockfiles: Map<string, string>,
): ProjectPreflight {
  const directory = join(root, dirname(configPath))
  const config = readConfig(join(root, configPath))
  const globbed = globbedFiles(root, configPath, config, seenFiles)
  const signals = {
    installed: hasNodeModules(root, directory),
    postinstall: declaresInstallScript(root, directory),
  }

  return {
    configPath,
    present: existsSync(join(root, configPath)),
    fingerprint: fingerprintOf(
      signals,
      lockfileHash(root, directory, lockfiles),
      config.compilerOptions,
      globbed,
    ),
    ...signals,
    globbed,
  }
}

/**
 * The fidelity preflight's first three signals support, and why it is not `typed`.
 *
 * Signal 2 is deliberately not a cause of its own: once `node_modules` exists,
 * `postinstall` has already run, so it only sharpens signal 1's remediation.
 * Signal 1 is reported ahead of signal 3 where both fire, because an install can
 * itself produce the files signal 3 is missing.
 */
export function fidelityOf(preflight: ProjectPreflight): {
  fidelity: Fidelity
  cause: PreconditionCause | null
} {
  if (!preflight.installed)
    return { fidelity: 'syntactic', cause: 'unprepared' }
  // A config whose includes match nothing on disk is usually waiting on codegen,
  // which ADR 0001 measured is not an install step.
  if (preflight.globbed.length === 0) {
    return { fidelity: 'syntactic', cause: 'missing-generated' }
  }
  return { fidelity: 'typed', cause: null }
}
