/**
 * Seeded value noise for the terrain's rock: it roughens the slopes the files
 * raise, so peaks read as mountains and not as smooth domes. Seeded by the
 * dataset, so one repository's ranges keep the same crags on every load.
 */

/** A hash of a lattice point and a seed, as a float in `[0, 1)`. */
function lattice(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise in `[0, 1)`. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = lattice(xi, yi, seed)
  const b = lattice(xi + 1, yi, seed)
  const c = lattice(xi, yi + 1, seed)
  const d = lattice(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/**
 * Ridged fractal noise in `[0, 1]`: sharp crests where plain noise would
 * have soft hills, which is what makes a range look like rock.
 */
export function ridged(x: number, y: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let octave = 0; octave < 4; octave++) {
    const n =
      1 - Math.abs(valueNoise(x * freq, y * freq, seed + octave) * 2 - 1)
    sum += n * n * amp
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum / norm
}
