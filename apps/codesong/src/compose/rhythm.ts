/**
 * Percussion for one section, from its subsystem. Patterns are Euclidean:
 * `k` hits spread as evenly as possible over sixteen steps, the shape behind
 * most of the world's dance rhythms. The code decides how many hits; the
 * spreading keeps any number of them musical.
 */

import type { Form, Motif, MotifNote, Provenance } from '../model.ts'
import type { Region } from '../regions.ts'
import type { Structure } from '../structure.ts'
import { quantise } from '../theory.ts'
import type { DrumStyle } from './genre.ts'
import { oddDrums, oddFill, phrasing, type Stroke } from './odd.ts'

/** Indexes into `DRUM_VOICES`. */
const KICK = 0
const SNARE = 1
const HAT = 2
const OPEN_HAT = 3

const STEPS = 16
const STEP = 0.25
/** Leaf files named as provenance; the rest are counted, not listed. */
const NAMED_LEAVES = 8

/** `pulses` hits spread evenly over `steps`, turned right by `rotation`. */
export function euclid(pulses: number, steps: number, rotation = 0): boolean[] {
  return Array.from({ length: steps }, (_, i) => {
    const at = (i - rotation + steps) % steps
    return (at * pulses) % steps < pulses
  })
}

function hit(voice: number, step: number, velocity: number): MotifNote {
  return { degree: voice, start: step * STEP, duration: STEP, velocity }
}

function provenance(structure: Structure, region: Region): Provenance {
  const leaves = region.files
    .filter((i) => structure.nodes[i]!.fanOut === 0)
    .sort(
      (a, b) => structure.nodes[b]!.fanIn - structure.nodes[a]!.fanIn || a - b,
    )
    .slice(0, NAMED_LEAVES)
  return {
    subsystem: region.path,
    files: leaves.map((i) => structure.nodes[i]!.path),
    structure: 'leaf-files',
  }
}

/** One bar's patterns, a step each. */
interface Patterns {
  readonly kicks: readonly boolean[]
  readonly hats: readonly boolean[]
  readonly ghosts: readonly boolean[]
}

/** Which drums a form lets play: the intro keeps hats only, the breakdown drops the kick. */
function kit(form: Form): { readonly kick: boolean; readonly snare: boolean } {
  return {
    kick: form !== 'intro' && form !== 'breakdown',
    snare: form !== 'intro',
  }
}

/** The backbeat on 2 and 4, or a ghost note where no kick lands. */
function snareAt(i: number, p: Patterns, kicked: boolean): MotifNote[] {
  if (i === 4 || i === 12) return [hit(SNARE, i, 100)]
  return p.ghosts[i] && !kicked ? [hit(SNARE, i, 40)] : []
}

/** Places one step's hits; each genre's drums are one of these. */
type Placer = (i: number, p: Patterns, form: Form) => MotifNote[]

/** The code's kicks under a backbeat. */
const boombap: Placer = (i, p, form) => {
  const allowed = kit(form)
  return [
    ...(p.hats[i] ? [hit(HAT, i, i % 4 === 0 ? 84 : 60)] : []),
    ...(allowed.kick && p.kicks[i] ? [hit(KICK, i, i === 0 ? 112 : 96)] : []),
    ...(allowed.snare ? snareAt(i, p, p.kicks[i]!) : []),
    ...(form === 'chorus' && i === 14 ? [hit(OPEN_HAT, i, 80)] : []),
  ]
}

/** Every other hat the code asks for, quietly: a pulse and nothing more. */
const hush: Placer = (i, p) =>
  p.hats[i] && i % 2 === 0 ? [hit(HAT, i, i % 4 === 0 ? 44 : 32)] : []

/**
 * Four on the floor. The code's hats fill the gaps; the clap comes in once
 * the section is more than an intro or a breakdown.
 */
const four: Placer = (i, p, form) => {
  const kick = form !== 'breakdown' && i % 4 === 0
  const clap = form !== 'intro' && form !== 'breakdown'
  return [
    ...(kick ? [hit(KICK, i, 118)] : []),
    ...(i % 4 === 2 ? [hit(OPEN_HAT, i, 72)] : []),
    ...(p.hats[i] && i % 4 !== 2 ? [hit(HAT, i, i % 2 === 0 ? 70 : 52)] : []),
    ...(clap ? snareAt(i, p, kick) : []),
  ]
}

/**
 * Where a two-step kicks: one and the and-of-three, plus any kick the code
 * asks for on an odd late step, which pushes the break along.
 */
function twoStep(i: number, p: Patterns): boolean {
  if (i === 0 || i === 10) return true
  return p.kicks[i]! && i % 2 === 1 && i > 5
}

/** A two-step under a snare on two and four. */
const breaks: Placer = (i, p, form) => {
  const allowed = kit(form)
  const kick = allowed.kick && twoStep(i, p)
  const hat = hit(HAT, i, i % 2 === 0 ? 78 : 50)
  return [
    ...(p.hats[i] ? [hat] : []),
    ...(kick ? [hit(KICK, i, i === 0 ? 116 : 100)] : []),
    ...(allowed.snare ? snareAt(i, p, kick) : []),
  ]
}

/** The ride's ding, ding-a ding by step, loudest on two and four. */
const RIDE: ReadonlyMap<number, number> = new Map([
  [0, 62],
  [4, 80],
  [6, 62],
  [8, 62],
  [12, 80],
  [14, 62],
])

/** Whether the snare comps on step `i`: an eighth off the beat where the code asks for a kick. */
const comps = (i: number, p: Patterns): boolean => p.kicks[i]! && i % 4 === 2

/**
 * Swing time. The closed hat plays the ride pattern; the kick feathers
 * every beat under it; the snare comps where the code asks for a kick, so
 * busier code comps more.
 */
const ride: Placer = (i, p, form) => {
  const allowed = kit(form)
  const ding = RIDE.get(i)
  return [
    ...(ding ? [hit(HAT, i, ding)] : []),
    ...(allowed.kick && i % 4 === 0 ? [hit(KICK, i, 34)] : []),
    ...(allowed.snare && comps(i, p) ? [hit(SNARE, i, 52)] : []),
  ]
}

const PLACERS: Readonly<Record<Exclude<DrumStyle, 'odd'>, Placer>> = {
  boombap,
  hush,
  four,
  breaks,
  ride,
}

const VOICES: Readonly<Record<Stroke[0], number>> = {
  kick: KICK,
  snare: SNARE,
  hat: HAT,
  open: OPEN_HAT,
}

/** The odd phrasing's strokes as drum notes, in order. */
const strokes = (list: readonly Stroke[]): MotifNote[] =>
  list
    .map(([voice, step, velocity]) => hit(VOICES[voice], step, velocity))
    .sort(byStart)

const byStart = (a: MotifNote, b: MotifNote): number =>
  a.start - b.start || a.degree - b.degree

/**
 * One bar of groove for a section.
 *
 * - Kicks: three to five, more when the region has more leaves.
 * - Hats: eight to sixteen, more when the region is denser.
 * - Snare: the backbeat, plus a ghost note for every doubling of its clusters.
 *
 * The code decides how many hits; `style`, the genre's, decides where they
 * land. In most styles the intro keeps only hats and the breakdown drops the
 * kick, so the form is audible in the drums. `random` turns the hat pattern,
 * which a seed may vary.
 */
export function groove(
  structure: Structure,
  region: Region,
  form: Form,
  random: () => number,
  style: DrumStyle = 'boombap',
): Motif {
  const kicks = euclid(3 + quantise(region.leafShare / 0.4, 0, 2), STEPS)
  const hatPulses = [8, 10, 12, 16][
    quantise(region.density / (region.density + 4), 0, 3)
  ]!
  const hats = euclid(hatPulses, STEPS, Math.floor(random() * 2))
  const ghosts = euclid(
    Math.min(3, Math.floor(Math.log2(region.clusters.length + 1))),
    STEPS,
    3,
  )

  const id = `groove:${region.path}:${form}`
  if (style === 'odd') {
    const groups = phrasing(region)
    const last = groups.at(-1)!
    return {
      id,
      source: provenance(structure, region),
      notes: strokes(oddDrums(groups, { kicks, hats, ghosts }, form)),
      length: (last.start + last.length) * STEP,
    }
  }
  const place = PLACERS[style]
  const notes = Array.from({ length: STEPS }, (_, i) =>
    place(i, { kicks, hats, ghosts }, form),
  ).flat()
  return {
    id,
    source: provenance(structure, region),
    notes: notes.sort(byStart),
    length: STEPS * STEP,
  }
}

/**
 * The bar before a new section: a kick, then a snare roll that gets louder
 * and, in a busy section, faster. Hushed drums have no fill; they keep their
 * groove to the end.
 */
export function fill(
  structure: Structure,
  region: Region,
  form: Form,
  intensity: number,
  style: DrumStyle = 'boombap',
): Motif {
  if (style === 'hush') {
    return {
      ...groove(structure, region, form, () => 0, style),
      id: `fill:${region.path}:${form}`,
    }
  }
  if (style === 'odd') {
    return {
      id: `fill:${region.path}:${form}`,
      source: provenance(structure, region),
      notes: strokes(oddFill()),
      length: STEPS * STEP,
    }
  }
  const every = intensity > 0.6 ? 1 : 2
  const notes: MotifNote[] = [hit(KICK, 0, 110)]
  for (let i = 8; i < STEPS; i += every) {
    notes.push(hit(SNARE, i, 60 + Math.round(((i - 8) / 8) * 60)))
  }
  return {
    id: `fill:${region.path}:${form}`,
    source: provenance(structure, region),
    notes,
    length: STEPS * STEP,
  }
}
