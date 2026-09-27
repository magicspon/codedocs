import type { FileDatum } from './atlas.ts'
import { hash, rng } from './rng.ts'
import { heightAt, type Field } from './terrain-field.ts'
import type { RadialTree } from './terrain-tree.ts'

/**
 * Mist: calls the analysis could not resolve, drawn as low haze pooling in the
 * valleys round the files that make them. Where the analysis cannot see, the
 * view is clouded. Only the blindest tenth of files get mist, as in the
 * galaxy's haze: nearly every file has a few blind spots, and mist
 * everywhere would say nothing.
 */
export interface Mist {
  /** Per puff, where it floats. */
  readonly positions: Float32Array
  /** Per puff, its size and a seed for its drift. */
  readonly sizes: Float32Array
  readonly seeds: Float32Array
}

/** The most puffs any repository gets, so a huge one stays quick to draw. */
const MOST = 6000
/** Candidate spots tried per puff; the lowest wins, so mist settles in valleys. */
const TRIES = 4

/** The files that get mist: the blindest tenth, by unresolved calls. */
export function mistyFiles(files: readonly FileDatum[]): number[] {
  const blind = files
    .map((f) => f.unresolved)
    .filter((u) => u > 0)
    .sort((a, b) => b - a)
  const cutoff = Math.max(1, blind[Math.floor(blind.length * 0.1)] ?? Infinity)
  return files.flatMap((f, i) => (f.unresolved >= cutoff ? [i] : []))
}

/** Scatters mist round the blindest files, in the low ground near each. */
export function mistOf(
  field: Field,
  tree: RadialTree,
  files: readonly FileDatum[],
): Mist {
  const misty = mistyFiles(files)
  const want = misty.map((i) => 6 + 8 * Math.log1p(files[i]!.unresolved))
  const total = want.reduce((a, b) => a + b, 0)
  const scale = total > MOST ? MOST / total : 1
  const positions: number[] = []
  const sizes: number[] = []
  const seeds: number[] = []
  const reach = tree.radius * 0.09
  misty.forEach((file, n) => {
    const node = tree.nodes[tree.fileNode[file]!]!
    const random = rng(hash(`mist:${files[file]!.path}`))
    const puffs = Math.round(want[n]! * scale)
    for (let p = 0; p < puffs; p++) {
      let best: [number, number, number] | null = null
      for (let t = 0; t < TRIES; t++) {
        const angle = random() * Math.PI * 2
        const r = reach * Math.sqrt(random())
        const x = node.x + Math.cos(angle) * r
        const z = node.z + Math.sin(angle) * r
        const y = heightAt(field, x, z)
        if (!best || y < best[1]) best = [x, y, z]
      }
      const [x, y, z] = best!
      positions.push(x, y + field.peak * (0.04 + 0.2 * random()), z)
      sizes.push(0.6 + random() * 0.9)
      seeds.push(random() * 100)
    }
  })
  return {
    positions: new Float32Array(positions),
    sizes: new Float32Array(sizes),
    seeds: new Float32Array(seeds),
  }
}
