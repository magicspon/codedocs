/**
 * What a repair and a cold build share: the report shape, one project's row,
 * and the header a repair stamps on the index.
 */

import { currentCommit } from '../discovery.ts'
import type { FilePath, ProjectNode } from '../model.ts'
import { fidelityOf, type ProjectPreflight } from '../preflight/index.ts'
import type { IndexHeader } from '../store/index.ts'
import { TOOL_VERSION, typescriptVersion } from './version.ts'

/** What one repair cost, in the only units that matter: files and waves. */
export interface RepairReport {
  readonly kind: 'cold' | 'wave'
  /** Files re-extracted. For a cold build, every file the projects contain. */
  readonly files: number
  /** How many propagation rounds ran. Always 0 for a cold build. */
  readonly waves: number
  /**
   * The projects re-analysed because their environment fingerprint moved.
   *
   * Reported separately from the file count because it is a different event: no
   * file changed, the machine did. ADR 0001 makes that a legitimate full
   * re-analysis of those projects, and one that is reported as such rather than
   * dressed up as drift.
   */
  readonly environment: readonly FilePath[]
  /** Why a cold build was chosen over a wave, when one was. */
  readonly reason: string
}

/**
 * One project's row, from the preflight measured for it.
 *
 * `rootFileCount` stays the analysis's own count of the files it extracted for
 * this project, which is not preflight's glob count: preflight reads the config
 * against the tree, and the analysis credits a shared file to exactly one
 * project. The two answer different questions, and only the first can be
 * recomputed without opening a program.
 */
export function projectRow(
  preflight: ProjectPreflight,
  rootFileCount: number,
): ProjectNode {
  const { fidelity, cause } = fidelityOf(preflight)
  return {
    configPath: preflight.configPath,
    fidelity,
    rootFileCount,
    analysedAt: new Date().toISOString(),
    fingerprint: preflight.fingerprint,
    cause,
    postinstall: preflight.postinstall,
  }
}

/** The header one repair stamps on the index. */
export const stamp = (root: string): IndexHeader => ({
  commit: currentCommit(root),
  analysedAt: new Date().toISOString(),
  toolVersion: TOOL_VERSION,
  typescriptVersion: typescriptVersion(),
})
