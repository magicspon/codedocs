/**
 * Math rock phrasing. The sixteenths of a four-bar phrase fall into groups
 * of odd sizes: a region's cell, such as 7+5, repeated until the phrase is
 * full. The accents drift against the bar line and only meet it again at
 * the end of the phrase, on a stop. The drums and bass read the same groups,
 * so they lock together however strange the phrase.
 */

import type { Form, MotifNote } from '../model.ts'
import type { Region } from '../regions.ts'

const STEP = 0.25
/** Sixteenths in a bar. */
const BAR_STEPS = 16
/** The shortest stop: a hit, then at least three sixteenths of silence. */
const STOP = 4

/**
 * Group sizes, in sixteenths, that a region's phrase cycles through. No cell
 * adds up to a whole bar or half of one, or the phrase would repeat each bar.
 */
const CELLS: readonly (readonly number[])[] = [
  [7, 5],
  [5, 5, 7],
  [7, 7, 9],
  [3, 5, 7],
  [7, 6],
  [9, 5],
  [5, 3, 3, 7],
]

/** One group of sixteenths in a phrase. */
export interface Group {
  readonly start: number
  readonly length: number
  /** Its place in the phrase. */
  readonly index: number
  /** The last group: one hit together, then silence. */
  readonly stop: boolean
}

/**
 * A region's phrase over `bars` bars: its cell repeated until the phrase is
 * full, with what is left over at the end held as the stop. The number of
 * files picks the cell, so neighbouring subsystems rarely share one.
 */
export function phrasing(region: Region, bars = 4): Group[] {
  const cell = CELLS[region.files.length % CELLS.length]!
  const total = bars * BAR_STEPS
  const groups: Group[] = []
  for (let start = 0, index = 0; start < total; index++) {
    const rest = total - start
    const size = cell[index % cell.length]!
    const stop = rest - size < STOP
    const length = stop ? rest : size
    groups.push({ start, length, index, stop })
    start += length
  }
  return groups
}

/** A drum hit: which drum, which sixteenth, how hard. */
export type Stroke = readonly [
  voice: 'kick' | 'snare' | 'hat' | 'open',
  step: number,
  velocity: number,
]

/** What the code gives the drums, as the other drum styles read it: a bar of steps each. */
export interface Asks {
  readonly kicks: readonly boolean[]
  readonly hats: readonly boolean[]
  readonly ghosts: readonly boolean[]
}

/** The stop: kick, snare and open hat together, then nothing. */
const stopStrokes = (s: number): Stroke[] => [
  ['kick', s, 120],
  ['snare', s, 110],
  ['open', s, 110],
]

/** The code's hats over a group, and its ghost notes wherever nothing is `struck`. */
function between(g: Group, asks: Asks, struck: Set<number>): Stroke[] {
  const strokes: Stroke[] = []
  for (let t = g.start; t < g.start + g.length; t++) {
    const at = t % BAR_STEPS
    if (asks.hats[at]) strokes.push(['hat', t, t === g.start ? 86 : 52])
    if (asks.ghosts[at] && !struck.has(t)) strokes.push(['snare', t, 38])
  }
  return strokes
}

/**
 * One group's drums. The kick starts it and the snare cracks two from its
 * end, so each group is heard as a unit whatever its size. A leafy region
 * (more kicks asked for) doubles the kick in long groups; the code's hats
 * and ghost notes fill in between.
 */
function groupStrokes(g: Group, asks: Asks, form: Form): Stroke[] {
  const s = g.start
  const snare = g.length >= 4 ? s + g.length - 2 : -1
  const leafy = asks.kicks.filter(Boolean).length >= 4
  const kicks = new Set([s, ...(leafy && g.length >= 7 ? [s + 3] : [])])
  const strokes: Stroke[] = [...kicks].map((k) => [
    'kick',
    k,
    k === s ? 108 : 92,
  ])
  if (snare >= 0) strokes.push(['snare', snare, 100])
  if (form === 'chorus' && g.index === 0) strokes.push(['open', s, 104])
  const struck = new Set([snare, ...kicks])
  strokes.push(...between(g, asks, struck))
  return strokes
}

/**
 * The drums over a phrase. The intro keeps only hats and the breakdown drops
 * the kick, as in every other style.
 */
export function oddDrums(
  groups: readonly Group[],
  asks: Asks,
  form: Form,
): Stroke[] {
  const strokes = groups.flatMap((g) =>
    g.stop ? stopStrokes(g.start) : groupStrokes(g, asks, form),
  )
  return strokes.filter(([voice]) => {
    if (voice === 'kick') return form !== 'intro' && form !== 'breakdown'
    if (voice === 'snare' || voice === 'open') return form !== 'intro'
    return true
  })
}

/** A bar of sixteenths in threes, snare after kick, rising into the next section. */
export function oddFill(): Stroke[] {
  return Array.from({ length: BAR_STEPS }, (_, t): Stroke => {
    const velocity = 60 + Math.round((t / BAR_STEPS) * 60)
    return t % 3 === 0 && t < 12
      ? ['kick', t, velocity]
      : ['snare', t, velocity]
  })
}

/** A bass note in a group: steps into the group, scale steps above the root. */
type Pluck = readonly [at: number, degree: number]

/**
 * One group's bass line. The root on the kick; in longer groups the octave
 * or fifth, then the third; and a step into the next group's root on the
 * group's last sixteenth, so the line pulls across the odd bar lines.
 */
function groupLine(g: Group, root: number, next: number): Pluck[] {
  if (g.stop) return [[0, root]]
  const lift = g.index % 2 === 1 ? 7 : 4
  const approach = next > root ? next - 1 : next + 1
  const line: Pluck[] = [[0, root]]
  if (g.length >= 3) line.push([2, root + lift])
  if (g.length >= 7) line.push([4, root + 2])
  if (g.length >= 4) line.push([g.length - 1, approach])
  return line
}

/**
 * The bass over a phrase of chords, one root a bar. Each note lasts until
 * the next; the stop is plucked short and left to ring out alone.
 */
export function oddBass(
  groups: readonly Group[],
  roots: readonly number[],
): MotifNote[] {
  const rootAt = (step: number) =>
    roots[Math.floor(step / BAR_STEPS) % roots.length]!
  const plucks = groups.flatMap((g) => {
    const next = rootAt(g.start + g.length)
    return groupLine(g, rootAt(g.start), next).map(
      ([at, degree]) => [g.start + at, degree, at === 0, g.stop] as const,
    )
  })
  return plucks.map(([step, degree, accent, stop], i): MotifNote => {
    const until =
      plucks[i + 1]?.[0] ?? groups.at(-1)!.start + groups.at(-1)!.length
    return {
      degree,
      start: step * STEP,
      duration: stop ? STEP : (until - step) * STEP * 0.9,
      velocity: accent ? 100 : 82,
    }
  })
}
