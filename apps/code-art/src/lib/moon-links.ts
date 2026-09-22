import { linksOf, type FileSymbols, type SymbolLink } from './atlas.ts'
import type { Planet, Ring, System } from './orbits.ts'

/**
 * The lines off a focused body's moons: each moon's calls and references,
 * run to wherever the far end is drawn. A pure function of the data, so the
 * scene only turns these places into points each frame.
 */

/** Where one end of a line is drawn. */
export type Place =
  /** A body on a ring: a moon being looked at, or a planet round the star. */
  | {
      readonly frame: 'moons' | 'planets'
      readonly ring: Ring
      readonly planet: Planet
    }
  /** The focused body the moons circle. */
  | { readonly frame: 'body' }
  /** The file's own star: top-level code, or a symbol no ring draws. */
  | { readonly frame: 'star' }
  /** Another file's star. */
  | { readonly frame: 'file'; readonly path: string }

/** One line, always from the caller or referrer to what it reaches. */
export interface MoonLink {
  readonly from: Place
  readonly to: Place
  /** `0` a call; `1 +` a `REFERENCE_KINDS` entry. */
  readonly via: number
  readonly count: number
}

type Drawn = Map<number, { ring: Ring; planet: Planet }>

/** Each drawn body in `system`, by symbol. */
function drawnIn(system: System | undefined): Drawn {
  const drawn: Drawn = new Map()
  for (const ring of system?.rings ?? [])
    for (const planet of ring.planets)
      drawn.set(planet.symbol, { ring, planet })
  return drawn
}

/**
 * Where a symbol of this file is drawn: as a moon in view, as the focused
 * body, or as a planet. A symbol nested out of view is drawn at its nearest
 * ancestor that is; top-level code, at the star.
 */
function placeIn(
  symbols: FileSymbols,
  moons: Drawn,
  planets: Drawn,
  body: number,
  symbol: number,
): Place {
  // Bounded by the tree's depth, but guarded against a bad parent list.
  for (let s = symbol, hops = 0; s >= 0 && hops < 64; hops++) {
    const moon = moons.get(s)
    if (moon) return { frame: 'moons', ...moon }
    if (s === body) return { frame: 'body' }
    const planet = planets.get(s)
    if (planet) return { frame: 'planets', ...planet }
    s = symbols.parents[s] ?? -1
  }
  return { frame: 'star' }
}

/** What a moon's links are resolved against: the bodies in view, and the one focused. */
interface View {
  readonly symbols: FileSymbols
  readonly moons: Drawn
  readonly planets: Drawn
  readonly body: number
}

/** Where `link`'s far end is drawn, or `null` when it should not be drawn from `near`. */
function farEnd(view: View, near: Planet, link: SymbolLink): Place | null {
  if (link.peer >= 0) {
    const path = view.symbols.peers?.[link.peer]
    return path ? { frame: 'file', path } : null
  }
  // Two moons in view both hold the link between them; draw it once.
  if (link.inbound && view.moons.has(link.other)) return null
  const far = placeIn(
    view.symbols,
    view.moons,
    view.planets,
    view.body,
    link.other,
  )
  // A link to the body the moons circle only clutters the view round it.
  if (far.frame === 'body') return null
  // A link into the moon's own insides has nowhere to go.
  return far.frame === 'moons' && far.planet === near ? null : far
}

/**
 * The lines off the moons of the deepest body in `focus`. `systems` are the
 * systems along the focus, from `systemsAlong`; there are none at the star.
 */
export function moonLinksOf(
  symbols: FileSymbols,
  systems: readonly System[],
  focus: readonly number[],
): MoonLink[] {
  const body = focus.at(-1)
  if (body === undefined || systems.length !== focus.length + 1) return []
  const view: View = {
    symbols,
    moons: drawnIn(systems.at(-1)),
    planets: drawnIn(systems[0]),
    body,
  }
  const out: MoonLink[] = []
  for (const [symbol, moon] of view.moons) {
    const near: Place = { frame: 'moons', ...moon }
    for (const link of linksOf(symbols, symbol)) {
      const far = farEnd(view, moon.planet, link)
      if (!far) continue
      out.push({
        from: link.inbound ? far : near,
        to: link.inbound ? near : far,
        via: link.via,
        count: link.count,
      })
    }
  }
  return out
}
