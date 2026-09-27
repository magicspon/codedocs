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
function snareAt(i: number, p: Patterns): MotifNote[] {
  if (i === 4 || i === 12) return [hit(SNARE, i, 100)]
  return p.ghosts[i] && !p.kicks[i] ? [hit(SNARE, i, 40)] : []
}

/** What plays on step `i`. */
function stepHits(i: number, p: Patterns, form: Form): MotifNote[] {
  const allowed = kit(form)
  return [
    ...(p.hats[i] ? [hit(HAT, i, i % 4 === 0 ? 84 : 60)] : []),
    ...(allowed.kick && p.kicks[i] ? [hit(KICK, i, i === 0 ? 112 : 96)] : []),
    ...(allowed.snare ? snareAt(i, p) : []),
  ]
}

const byStart = (a: MotifNote, b: MotifNote): number =>
  a.start - b.start || a.degree - b.degree

/**
 * One bar of groove for a section.
 *
 * - Kicks: three to five, more when the region has more leaves.
 * - Hats: eight to sixteen, more when the region is denser.
 * - Snare: the backbeat, plus a ghost note for every doubling of its clusters.
 *
 * The intro keeps only hats and the breakdown drops the kick, so the form is
 * audible in the drums. `random` turns the hat pattern, which a seed may vary.
 */
export function groove(
  structure: Structure,
  region: Region,
  form: Form,
  random: () => number,
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

  const notes = Array.from({ length: STEPS }, (_, i) =>
    stepHits(i, { kicks, hats, ghosts }, form),
  ).flat()
  if (form === 'chorus') notes.push(hit(OPEN_HAT, 14, 80))
  return {
    id: `groove:${region.path}:${form}`,
    source: provenance(structure, region),
    notes: notes.sort(byStart),
    length: STEPS * STEP,
  }
}

/**
 * The bar before a new section: a kick, then a snare roll that gets louder
 * and, in a busy section, faster.
 */
export function fill(
  structure: Structure,
  region: Region,
  form: Form,
  intensity: number,
): Motif {
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
