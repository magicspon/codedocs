/**
 * A spatial hash over points in 3D: the metro asks "what is near here?" for
 * every building while laying out, and every frame while the buggy drives.
 * Points on the planet's surface fill only a shell of cells, so a hash of
 * cells beats any grid over the whole cube.
 */

/** Cells per axis the key packs; ample for any planet the layout makes. */
const SPAN = 2048
const HALF = SPAN / 2

/** Points bucketed by cube cell, looked up by cell and its 26 neighbours. */
export class SpaceHash {
  readonly #cell: number
  readonly #buckets = new Map<number, number[]>()

  /** `cell` should be at least the widest reach a query will ask for. */
  constructor(cell: number) {
    this.#cell = cell
  }

  #key(ix: number, iy: number, iz: number): number {
    return ((ix + HALF) * SPAN + (iy + HALF)) * SPAN + (iz + HALF)
  }

  /** Files item `id` at `(x, y, z)`. */
  insert(id: number, x: number, y: number, z: number): void {
    const c = this.#cell
    const key = this.#key(
      Math.floor(x / c),
      Math.floor(y / c),
      Math.floor(z / c),
    )
    const bucket = this.#buckets.get(key)
    if (bucket) bucket.push(id)
    else this.#buckets.set(key, [id])
  }

  /** Calls `visit` with every item in the cells round `(x, y, z)`: all within one cell, and some a little further. */
  near(x: number, y: number, z: number, visit: (id: number) => void): void {
    const c = this.#cell
    const ix = Math.floor(x / c)
    const iy = Math.floor(y / c)
    const iz = Math.floor(z / c)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.#buckets.get(this.#key(ix + dx, iy + dy, iz + dz))
          if (bucket) for (const id of bucket) visit(id)
        }
  }
}

/** A hash of `count` points packed `[x, y, z]` in `points`. */
export function hashOf(
  points: ArrayLike<number>,
  count: number,
  cell: number,
): SpaceHash {
  const hash = new SpaceHash(cell)
  for (let i = 0; i < count; i++)
    hash.insert(i, points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!)
  return hash
}
