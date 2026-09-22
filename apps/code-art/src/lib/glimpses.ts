import type { Planet, Ring, System } from './orbits.ts'

/** The most moons a body shows before it is focused. */
export const GLIMPSES = 3

/** One moon shown round an unfocused body, on the ring it keeps when focused. */
export interface Glimpse {
  readonly ring: Ring
  readonly planet: Planet
}

/**
 * A few of `moons`, standing in for them all until their body is focused.
 * Taken from the full system rather than laid out afresh, so zooming in
 * keeps them where they were and only adds the rest. Spread evenly across
 * the rings, inner first, so a crowded belt does not show three neighbours.
 * With `all`, every moon: for a body picked out, before it is zoomed into.
 */
export function glimpsesOf(moons: System, all = false): Glimpse[] {
  const every = moons.rings.flatMap((ring) =>
    ring.planets.map((planet) => ({ ring, planet })),
  )
  if (all) return every
  const shown = Math.min(every.length, GLIMPSES)
  return Array.from(
    { length: shown },
    (_, k) => every[Math.floor((k * every.length) / shown)]!,
  )
}
