/**
 * Seeded randomness, so one repository always draws the same picture: the art
 * is a function of the index, and a reload that moved every star would say the
 * data had changed when it had not.
 */

/** A 32-bit FNV-1a hash of a string, used as a seed. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A deterministic generator returning floats in `[0, 1)` (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard-normal sample from a uniform source (Box–Muller). */
export function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}
