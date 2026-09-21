import type { System } from './orbits.ts'

/**
 * Where a reader is inside a file's system: the bodies they have zoomed into,
 * star outward, and the body picked out at the level they are looking at.
 * Kept apart from the scene so the walk can be tested without a canvas.
 */
export interface SystemNav {
  /** Symbols zoomed into, outermost first; empty at the star. */
  readonly focus: readonly number[]
  /** The body picked out on the current level, or `null`. */
  readonly highlight: number | null
}

export const AT_STAR: SystemNav = { focus: [], highlight: null }

/** The named bodies on `system`'s rings, inner ring first, each ring in source order. */
export function bodiesOf(system: System): number[] {
  return system.rings.flatMap((ring) =>
    ring.planets.map((p) => p.symbol).filter((s) => s >= 0),
  )
}

/** Picks out the next body (`by` 1) or the previous (`by` -1), wrapping round. */
export function step(
  nav: SystemNav,
  bodies: readonly number[],
  by: 1 | -1,
): SystemNav {
  if (bodies.length === 0) return nav
  const at = nav.highlight === null ? -1 : bodies.indexOf(nav.highlight)
  // With nothing picked out, forward starts at the first and back at the last.
  const from = at < 0 ? (by > 0 ? -1 : 0) : at
  const next = (from + by + bodies.length) % bodies.length
  return { ...nav, highlight: bodies[next]! }
}

/** Zooms into the picked-out body, or the first when none is. */
export function enter(nav: SystemNav, bodies: readonly number[]): SystemNav {
  const body =
    nav.highlight !== null && bodies.includes(nav.highlight)
      ? nav.highlight
      : bodies[0]
  if (body === undefined) return nav
  return { focus: [...nav.focus, body], highlight: null }
}

/** Zooms out one level, keeping the body just left picked out. */
export function leave(nav: SystemNav): SystemNav {
  const left = nav.focus.at(-1)
  if (left === undefined) return nav
  return { focus: nav.focus.slice(0, -1), highlight: left }
}

/**
 * A click on `symbol` at `depth`: on the body already focused there, zoom out
 * to the level it circles in; on any other, zoom into it.
 */
export function select(
  nav: SystemNav,
  depth: number,
  symbol: number,
): SystemNav {
  const kept = nav.focus.slice(0, depth)
  return nav.focus[depth] === symbol
    ? { focus: kept, highlight: symbol }
    : { focus: [...kept, symbol], highlight: null }
}

/**
 * The plain keys a system claims from the rest of the viewer, which otherwise
 * uses Escape to clear the file and Enter to follow a link.
 */
export interface SystemClaims {
  /** Escape zooms out: the reader is inside a body. */
  readonly leave: boolean
  /** Enter zooms in: the picked-out body has moons. */
  readonly enter: boolean
}

export const NO_CLAIMS: SystemClaims = { leave: false, enter: false }

/** What `nav` claims, given how many moons each symbol has. */
export function claimsOf(
  nav: SystemNav,
  moons: (symbol: number) => number,
): SystemClaims {
  return {
    leave: nav.focus.length > 0,
    enter: nav.highlight !== null && moons(nav.highlight) > 0,
  }
}
