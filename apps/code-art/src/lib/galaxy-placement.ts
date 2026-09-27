import type { GalaxyStructure } from './galaxy-shape.ts'
import { gaussian } from './rng.ts'

type Point = [number, number, number]

/**
 * Where each file's star sits, in `Atlas.files` order, for the structure's
 * shape. Radius is always gravity: the files most leaned on sit in the
 * middle, whatever the shape. `clumps` seeds an irregular galaxy's clumps
 * apart from `random`, so the draws after placement do not depend on it.
 */
export function placeFiles(
  structure: GalaxyStructure,
  radius: number,
  random: () => number,
  clumps: () => number,
): Point[] {
  const armOf = new Map(structure.arms.map((k, i) => [k, i]))
  const arm = (i: number): number | undefined => armOf.get(structure.keys[i]!)
  const count = structure.arms.length
  switch (structure.shape) {
    case 'elliptical':
      return structure.rank.map((rank) => ellipticalFile(rank, radius, random))
    case 'irregular':
      return irregularFiles(structure, radius, random, clumps)
    case 'barred':
      return structure.rank.map((rank, i) => {
        const a = arm(i)
        return a === undefined
          ? haloFile(radius, random)
          : barredFile(a, count, rank, radius, random)
      })
    case 'spiral':
      return structure.rank.map((rank, i) => {
        const a = arm(i)
        return a === undefined
          ? haloFile(radius, random)
          : spiralFile(a, count, rank, radius, random)
      })
  }
}

/** How far a file sits from the middle: further the less it is leaned on. */
function reach(rank: number, radius: number): number {
  return radius * (0.04 + 0.96 * Math.pow(rank, 0.75))
}

/** A loose flattened shell, for code outside the main arms. */
function haloFile(radius: number, random: () => number): Point {
  const theta = random() * Math.PI * 2
  const phi = Math.acos(2 * random() - 1)
  const shell = radius * (0.5 + random() * 0.8)
  return [
    shell * Math.sin(phi) * Math.cos(theta),
    shell * Math.cos(phi) * 0.45,
    shell * Math.sin(phi) * Math.sin(theta),
  ]
}

/** How thick the disc is at `t` of the radius: a bulge in the middle, thin at the rim. */
function thickness(t: number): number {
  return 0.35 + 3 * Math.exp(-t * t * 10)
}

/** A file on spiral arm `arm` of `count`, winding out as it loses pull. */
function spiralFile(
  arm: number,
  count: number,
  rank: number,
  radius: number,
  random: () => number,
): Point {
  const r = reach(rank, radius)
  const t = r / radius
  const theta = (arm / count) * Math.PI * 2 + t * 4.2 + gaussian(random) * 0.13
  const spread = gaussian(random) * radius * 0.018
  return [
    Math.cos(theta) * r + spread,
    gaussian(random) * thickness(t),
    Math.sin(theta) * r + spread,
  ]
}

/** How far the bar runs, against the radius. */
const BAR = 0.3

/**
 * A file in a barred spiral. The files most leaned on lie along a bar; past
 * its ends the arms wind out, alternate arms from alternate ends, each
 * winding a little looser than the one before so the pair fans apart.
 */
function barredFile(
  arm: number,
  count: number,
  rank: number,
  radius: number,
  random: () => number,
): Point {
  const r = reach(rank, radius)
  const t = r / radius
  const end = arm % 2 === 0 ? 0 : Math.PI
  if (t < BAR) {
    return [
      Math.cos(end) * r + gaussian(random) * radius * 0.02,
      gaussian(random) * thickness(t),
      gaussian(random) * radius * (0.025 + 0.04 * (1 - t / BAR)),
    ]
  }
  // Arms from one end take turns winding looser, so they do not overlap.
  const wind = 3.4 + Math.floor(arm / 2) * (2.4 / Math.max(1, count / 2))
  const theta = end + (t - BAR) * wind + gaussian(random) * 0.12
  const spread = gaussian(random) * radius * 0.018
  return [
    Math.cos(theta) * r + spread,
    gaussian(random) * thickness(t),
    Math.sin(theta) * r + spread,
  ]
}

/**
 * A file in an elliptical galaxy: a smooth, slightly squashed ball with no
 * disc, packed tighter to the middle than a spiral's.
 */
function ellipticalFile(
  rank: number,
  radius: number,
  random: () => number,
): Point {
  const r = radius * (0.02 + 0.85 * Math.pow(rank, 1.1))
  const theta = random() * Math.PI * 2
  const phi = Math.acos(2 * random() - 1)
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi) * 0.62,
    r * Math.sin(phi) * Math.sin(theta) * 0.8,
  ]
}

/**
 * An irregular galaxy: each folder is a clump, the clumps thrown lopsidedly
 * to one side. Pull draws a whole clump in by its files' average rank, so the
 * busiest folders crowd the middle; pulling each file instead would smear
 * every clump into a spoke.
 */
function irregularFiles(
  structure: GalaxyStructure,
  radius: number,
  random: () => number,
  clumps: () => number,
): Point[] {
  const { keys, rank } = structure
  const counts = new Map<string, number>()
  const ranks = new Map<string, number>()
  keys.forEach((k, i) => {
    counts.set(k, (counts.get(k) ?? 0) + 1)
    ranks.set(k, (ranks.get(k) ?? 0) + rank[i]!)
  })
  const lean = clumps() * Math.PI * 2
  const centres = new Map<string, Point>()
  for (const k of [...counts.keys()].sort()) {
    const pulled = 0.25 + 0.75 * Math.sqrt(ranks.get(k)! / counts.get(k)!)
    const angle = lean + gaussian(clumps) * 1.3
    const distance = radius * 0.9 * Math.sqrt(clumps()) * pulled
    centres.set(k, [
      Math.cos(angle) * distance,
      gaussian(clumps) * radius * 0.1,
      Math.sin(angle) * distance,
    ])
  }
  return keys.map((k) => {
    const [cx, cy, cz] = centres.get(k)!
    // Bigger folders make bigger clumps.
    const sigma =
      radius * (0.03 + 0.12 * Math.sqrt(counts.get(k)! / keys.length))
    return [
      cx + gaussian(random) * sigma,
      cy + gaussian(random) * sigma * 0.5,
      cz + gaussian(random) * sigma,
    ]
  })
}
