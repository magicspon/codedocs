import { hash, rng } from './rng.ts'

/**
 * A dataset's hue in degrees, seeded by its name. The landing card glows in
 * it and the galaxy's palette is built round it, so the two always match.
 * Kept free of three.js so the landing page can import it cheaply.
 */
export function hueOf(name: string): number {
  const random = rng(hash(name))
  // The third draw, to keep the colours the galaxy graphic had.
  random()
  random()
  return Math.floor(random() * 360)
}
