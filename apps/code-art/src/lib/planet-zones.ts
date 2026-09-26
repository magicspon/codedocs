import { FIRST_RING, keplerSpeed, MAX_PER_RING } from './kepler.ts'
import type { Planet, Ring, System } from './orbits.ts'
import { gaussian, hash, rng } from './rng.ts'

/**
 * A file's planets laid out like a solar system, zone by zone outward: rocky
 * planets, the asteroid belt, gas giants, ice giants, dwarf planets and the
 * Kuiper belt. Each planet keeps an orbit of its own; a zone's smaller
 * bodies, past what it has room for, fall into its belt. Top-level variables
 * are loose matter: the asteroid belt, then, in a file with loads, the Kuiper
 * belt, and past even that an Oort cloud.
 */

/** A symbol waiting for its place: its index, and how many symbols it declares. */
export interface Member {
  /** Index in the file's `FileSymbols`, or `-1` when the names are not known. */
  readonly symbol: number
  readonly children: number
}

/** A band of the system, and the kinds of symbol whose planets circle in it. */
interface Zone {
  /** Indexes into `KINDS`, inner first. */
  readonly kinds: readonly number[]
  /** How many get an orbit of their own; the rest are its belt. */
  readonly cap: number
  /** Planet radius with no members, what each member adds (by its root), and the most. */
  readonly base: number
  readonly grow: number
  readonly max: number
  /** How far its orbits tip off the system's plane. */
  readonly tilt: number
  /** Clear space between one orbit's planets and the next's. */
  readonly gap: number
  /** Which of the file's variables, by `[start, end)`, join its belt. */
  readonly loose?: readonly [number, number]
}

/** Top-level variables: loose matter, never planets. */
const LOOSE_KIND = 5
/** How many variables the asteroid belt holds before the Kuiper belt takes the rest. */
const ASTEROIDS = 40
/** How many more the Kuiper belt holds before they drift out to an Oort cloud. */
const KUIPER = 160

const ZONES: readonly Zone[] = [
  // Rocky planets: the working code, small and close in.
  {
    kinds: [0, 6],
    cap: 6,
    base: 0.07,
    grow: 0.012,
    max: 0.12,
    tilt: 0.03,
    gap: 0.3,
    loose: [0, ASTEROIDS],
  },
  // Gas giants: classes and namespaces, swollen by their members.
  {
    kinds: [1, 7],
    cap: 4,
    base: 0.16,
    grow: 0.035,
    max: 0.34,
    tilt: 0.03,
    gap: 0.5,
  },
  // Ice giants: shapes without behaviour, cold and further out.
  {
    kinds: [2, 4],
    cap: 4,
    base: 0.11,
    grow: 0.018,
    max: 0.18,
    tilt: 0.04,
    gap: 0.4,
  },
  // Dwarf planets: type aliases, small, on steep orbits like Pluto's.
  {
    kinds: [3],
    cap: 5,
    base: 0.04,
    grow: 0.004,
    max: 0.06,
    tilt: 0.3,
    gap: 0.28,
    loose: [ASTEROIDS, ASTEROIDS + KUIPER],
  },
]

/** Extra space between zones, so each reads as its own band. */
const ZONE_GAP = 0.25
/** A belt or cloud body's radius; they are rubble, not worlds. */
const RUBBLE = 0.022
/** The Oort cloud's radius against the outermost orbit's, plus a margin. */
const CLOUD_OUT = 1.7
const CLOUD_MARGIN = 1
/** How thick the cloud's shell is, against its radius. */
const CLOUD_DEPTH = 0.08

/** One orbit to lay down, before it has a radius. */
interface Spec {
  readonly kind: number
  readonly form: 'orbit' | 'belt'
  readonly size: number
  /** How far its bodies reach off its line: a planet's radius, a belt's spread. */
  readonly extent: number
  readonly tilt: number
  readonly gap: number
  readonly zone: number
  readonly members: readonly Member[]
}

/** A belt spreads with its crowd, up to a limit. */
const beltWidth = (count: number): number =>
  Math.min(0.3, Math.sqrt(Math.min(count, MAX_PER_RING)) * 0.025)

/**
 * One zone's orbits: its largest members each on their own, the rest, and
 * its share of the variables, its belts.
 */
function zoneSpecs(
  zone: Zone,
  index: number,
  members: readonly (readonly Member[])[],
): Spec[] {
  const pool = zone.kinds.flatMap((kind) => members[kind] ?? [])
  // The biggest earn an orbit; a stable sort keeps ties in source order.
  const own = new Set(
    [...pool].sort((a, b) => b.children - a.children).slice(0, zone.cap),
  )
  const specs: Spec[] = []
  const base = { tilt: zone.tilt, gap: zone.gap, zone: index }
  for (const kind of zone.kinds)
    for (const m of members[kind] ?? []) {
      if (!own.has(m)) continue
      const size = Math.min(
        zone.max,
        zone.base + zone.grow * Math.sqrt(m.children),
      )
      specs.push({
        ...base,
        kind,
        form: 'orbit',
        size,
        extent: size,
        members: [m],
      })
    }
  const belts = zone.kinds.map((kind) => ({
    kind,
    rest: (members[kind] ?? []).filter((m) => !own.has(m)),
  }))
  if (zone.loose)
    belts.push({
      kind: LOOSE_KIND,
      rest: (members[LOOSE_KIND] ?? []).slice(...zone.loose),
    })
  for (const { kind, rest } of belts) {
    if (rest.length === 0) continue
    const extent = beltWidth(rest.length)
    specs.push({
      ...base,
      kind,
      form: 'belt',
      size: RUBBLE,
      extent,
      members: rest,
    })
  }
  return specs
}

/**
 * Every orbit in the system with its radius, inner first, and how far out
 * the last one lies. Each clears the one inside it by its zone's gap.
 */
function placed(members: readonly (readonly Member[])[]): {
  specs: Spec[]
  radii: number[]
  reach: number
} {
  const specs = ZONES.flatMap((zone, i) => zoneSpecs(zone, i, members))
  const radii: number[] = []
  specs.forEach((spec, i) => {
    const prev = specs[i - 1]
    if (!prev) {
      radii.push(FIRST_RING)
      return
    }
    // A zone's belts share one band, so its mixed rubble reads as one belt.
    const shared =
      prev.form === 'belt' && spec.form === 'belt' && prev.zone === spec.zone
    const step = shared
      ? 0
      : prev.extent +
        spec.gap +
        spec.extent +
        (prev.zone === spec.zone ? 0 : ZONE_GAP)
    radii.push(radii[i - 1]! + step)
  })
  return { specs, radii, reach: radii.at(-1) ?? FIRST_RING }
}

/**
 * How far out a system with these members reaches, without laying out a
 * body: the outermost orbit's radius. The Oort cloud lies beyond it and is
 * left out, or a camera stood back to see it would lose the planets.
 */
export function zonesReach(members: readonly (readonly Member[])[]): number {
  return placed(members).reach
}

/** A belt's bodies, spread round its line and a little off it. */
function beltPlanets(spec: Spec, random: () => number): Planet[] {
  const shown = spec.members.slice(0, MAX_PER_RING)
  const offset = random() * Math.PI * 2
  return shown.map((m, k) => ({
    phase: offset + ((k + random() * 0.6) / shown.length) * Math.PI * 2,
    drift: gaussian(random) * spec.extent * 0.5,
    lift: gaussian(random) * spec.extent * 0.15,
    symbol: m.symbol,
  }))
}

/** The Oort cloud: `members` scattered over a thick shell of `radius`. */
function cloudOf(
  members: readonly Member[],
  radius: number,
  random: () => number,
): Ring {
  const shown = members.slice(0, MAX_PER_RING)
  return {
    kind: LOOSE_KIND,
    form: 'cloud',
    radius,
    tilt: 0,
    node: random() * Math.PI * 2,
    speed: keplerSpeed(radius, 1),
    size: RUBBLE,
    count: members.length,
    heat: null,
    planets: shown.map((m) => {
      // Even over the sphere: height uniform, not latitude, or the poles bunch.
      const up = random() * 2 - 1
      const r = radius * (1 + gaussian(random) * CLOUD_DEPTH)
      return {
        phase: random() * Math.PI * 2,
        drift: r * Math.sqrt(1 - up * up) - radius,
        lift: r * up,
        symbol: m.symbol,
      }
    }),
  }
}

/**
 * Lays out a file's planets by zone, the same way every time for `seed`.
 * `members` lists each kind's symbols, indexed by `KINDS`.
 */
export function zonesOf(
  members: readonly (readonly Member[])[],
  seed: string,
): System {
  const random = rng(hash(seed))
  const { specs, radii, reach } = placed(members)
  const rings: Ring[] = specs.map((spec, i) => {
    const radius = radii[i]!
    return {
      kind: spec.kind,
      form: spec.form,
      radius,
      tilt: gaussian(random) * spec.tilt,
      node: random() * Math.PI * 2,
      speed: keplerSpeed(radius, 1),
      size: spec.size,
      count: spec.members.length,
      heat: null,
      planets:
        spec.form === 'belt'
          ? beltPlanets(spec, random)
          : [
              {
                phase: random() * Math.PI * 2,
                drift: 0,
                lift: 0,
                symbol: spec.members[0]!.symbol,
              },
            ],
    }
  })
  const cloud = (members[LOOSE_KIND] ?? []).slice(ASTEROIDS + KUIPER)
  if (cloud.length > 0)
    rings.push(cloudOf(cloud, reach * CLOUD_OUT + CLOUD_MARGIN, random))
  return { rings, reach }
}
