/** The environment fingerprint: the fact set that decides whether a stored fidelity still holds. */

import { createHash } from 'node:crypto'

import type { FilePath } from '../model.ts'

/** Declaration files, which retype files that never import them. */
const DECLARATION = /\.d\.[cm]?ts$/

/**
 * The fingerprint inputs, hashed into one string.
 *
 * ADR 0009 names three: the lockfile hash, the project's `compilerOptions`, and
 * the count and set-hash of the files its config globs. Two refinements, both
 * forced by the shipped code rather than chosen:
 *
 * **Signals 1 and 2 join it.** An install over a fresh clone changes none of the
 * three — the lockfile is already committed, no config moves, no source file
 * appears — so the fingerprint would miss the one case ADR 0001 named when it
 * required a fingerprint at all. `existsSync` on `node_modules` is not walking
 * it, which is the constraint ADR 0009 actually placed on these inputs.
 *
 * **Only the declaration files of the glob set are hashed**, plus whether the
 * set is empty. Hashing every globbed path makes creating one ordinary file a
 * full re-analysis of its project — 2,316 files on cal.com's `apps/web` where
 * the wave repairs one — and a new module is content drift, which ADR 0004
 * repairs file by file by design. What the wave *cannot* repair is a declaration
 * file, because nothing imports it: it retypes files that never mention it, so
 * its arrival has to invalidate the project. Every codegen ADR 0001 measured —
 * Redwood's `.redwood/types`, Next's `next-env.d.ts` and `.next/types`, Prisma's
 * client — lands as declarations, so this is the same signal at a lower cost.
 */
export function fingerprintOf(
  signals: { installed: boolean; postinstall: boolean },
  lockfile: string,
  compilerOptions: Record<string, unknown>,
  globbed: readonly FilePath[],
): string {
  const hash = createHash('sha256')
  hash.update(signals.installed ? 'installed' : 'unprepared')
  hash.update('\0')
  hash.update(signals.postinstall ? 'postinstall' : 'none')
  hash.update('\0')
  hash.update(lockfile)
  hash.update('\0')
  hash.update(canonical(compilerOptions))
  hash.update('\0')
  hash.update(globbed.length === 0 ? 'empty' : 'globbing')
  hash.update('\0')
  for (const path of globbed) {
    if (!DECLARATION.test(path)) continue
    hash.update(path)
    hash.update('\n')
  }
  return hash.digest('hex')
}

/** JSON with object keys sorted, so a reordered config is not a changed one. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
  )
  return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`
}
