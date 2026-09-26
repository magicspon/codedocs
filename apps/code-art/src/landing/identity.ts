import { hash, rng } from '../lib/rng.ts'

/**
 * A dataset's hue, seeded by its name so its card always glows the same
 * colour. The third draw, to keep the colours the galaxy graphic had.
 */
export function hueOf(name: string): number {
  const random = rng(hash(name))
  random()
  random()
  return Math.floor(random() * 360)
}

/** A catalogue number for `name`, in the style of the New General Catalogue. */
export function designation(name: string): string {
  return `NGC ${1000 + (hash(name) % 7000)}`
}
