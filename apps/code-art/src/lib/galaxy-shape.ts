import type { Atlas } from './atlas.ts'

/**
 * The galaxy's Hubble type, read from how the code is organised:
 *
 * - **elliptical**: nearly everything leans on a few files, so the galaxy is
 *   one smooth lump round them (typescript's checker).
 * - **barred**: a strong core with folders winding out of it: a spiral whose
 *   arms leave the ends of a bar.
 * - **irregular**: most code sits outside the main folders, so it scatters in
 *   lopsided clumps with no arms at all.
 * - **spiral**: folders split the code evenly, one arm each.
 */
export type GalaxyShape = 'elliptical' | 'barred' | 'spiral' | 'irregular'

/** How the code is organised: what a galaxy's shape is read from. */
export interface GalaxyStructure {
  readonly shape: GalaxyShape
  /** Each file's group: its directory, at the depth that best splits the repo. */
  readonly keys: readonly string[]
  /** The largest groups, biggest first: the spiral arms. */
  readonly arms: readonly string[]
  /** Each file's pull rank: `0` for the file most leaned on, `1` for the least. */
  readonly rank: readonly number[]
  /** Share of all pull held by the top 5% of files. */
  readonly pull: number
  /** Share of files outside the arms. */
  readonly halo: number
}

const MAX_ARMS = 8
/** Past these shares of pull, the core swallows the arms (elliptical) or grows a bar. */
const ELLIPTICAL_PULL = 0.7
const BARRED_PULL = 0.6
/** Past this share of files outside the arms, there are no arms to speak of. */
const IRREGULAR_HALO = 0.45

/**
 * Finds the shallowest directory depth that splits the repo into at least
 * three sizeable groups, none holding most of the files — otherwise vscode's
 * `src/` would be one arm and the spiral would read as a disc.
 */
function armKeys(paths: readonly string[]): string[] {
  for (let depth = 1; depth <= 5; depth++) {
    const keys = paths.map((p) => p.split('/').slice(0, depth).join('/'))
    const counts = new Map<string, number>()
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
    const sizeable = [...counts.values()].filter(
      (n) => n >= paths.length * 0.02,
    )
    const largest = Math.max(...counts.values())
    if (sizeable.length >= 3 && largest <= paths.length * 0.45) return keys
  }
  return paths.map((p) => p.split('/')[0]!)
}

/** The shape for a repo whose top files hold `pull` and whose halo holds `halo`. */
export function shapeOf(pull: number, halo: number): GalaxyShape {
  // A lump is a lump, however its folders fall.
  if (pull >= ELLIPTICAL_PULL) return 'elliptical'
  if (halo >= IRREGULAR_HALO) return 'irregular'
  return pull >= BARRED_PULL ? 'barred' : 'spiral'
}

/** Reads the structure, and so the shape, from a dataset. */
export function galaxyStructure(
  atlas: Pick<Atlas, 'files' | 'imports'>,
): GalaxyStructure {
  const { files } = atlas
  const n = files.length

  // Gravity: how much of the rest of the codebase leans on this file.
  const importsIn = Array.from({ length: n }, () => 0)
  for (const [, to] of atlas.imports) importsIn[to]!++
  const gravity = files.map(
    (f, i) => f.callsIn + f.refsIn * 0.5 + importsIn[i]! * 2,
  )
  const order = files.map((_, i) => i).sort((a, b) => gravity[b]! - gravity[a]!)
  const rank: number[] = Array.from({ length: n }, () => 0)
  order.forEach((file, r) => (rank[file] = r / Math.max(1, n - 1)))
  const total = gravity.reduce((a, b) => a + b, 0)
  const top = order
    .slice(0, Math.ceil(n * 0.05))
    .reduce((sum, i) => sum + gravity[i]!, 0)
  const pull = total > 0 ? top / total : 0

  const keys = armKeys(files.map((f) => f.path))
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const arms = ranked.slice(0, MAX_ARMS).map(([k]) => k)
  const inArms = ranked
    .slice(0, MAX_ARMS)
    .reduce((sum, [, count]) => sum + count, 0)
  const halo = n > 0 ? 1 - inArms / n : 0

  return { shape: shapeOf(pull, halo), keys, arms, rank, pull, halo }
}
