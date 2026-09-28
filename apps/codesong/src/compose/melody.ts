/**
 * Lead motifs from dependency paths: each file on the chain is one note, and
 * how the file differs from the one before it decides the interval, length
 * and any breath before it.
 *
 * The files on a dependency path are nearly all hubs, so any measure ranked
 * across the whole repository (fan-in, centrality) sits near the top for all
 * of them and every phrase comes out the same shape. Comparing neighbours on
 * the path keeps the contour tied to the code but different for each path.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'

/** A motif never runs past two bars, so it can recur inside short sections. */
const MAX_BEATS = 8
const BAR = 4

/** Where a phrase may start: the tonic chord, picked by the first file's depth. */
const OPENINGS = [0, 2, 4, 7]

/**
 * Interval sizes in scale steps, by how much more or less used the next file
 * is: a repeat, a step, a third or a fifth.
 */
const LEAPS = [0, 1, 2, 4]

/** Note lengths in beats, chosen by fan-out: a file that does a lot moves fast. */
const DURATIONS = [2, 1.5, 1, 0.75, 0.5]

/** The pause before a note whose file sits in another folder. */
const BREATH = 0.5

/** Keeps a long climb inside a playable range around the tonic. */
function fold(degree: number): number {
  if (degree > 9) return degree - 7
  if (degree < -3) return degree + 7
  return degree
}

/** Scale degrees of the tonic chord, which a phrase comes to rest on. */
function settle(degree: number): number {
  const within = ((degree % 7) + 7) % 7
  // The leading note rises to the tonic; any other note off the chord falls
  // a step onto it, so most phrases end by falling.
  if (within === 6) return degree + 1
  return within % 2 === 1 ? degree - 1 : degree
}

const folder = (node: StructureNode): string =>
  node.path.slice(0, node.path.lastIndexOf('/'))

/**
 * The step from `from` to `to`. Up when `to` is used by more files, down
 * when by fewer, and further the bigger the ratio: log2 of it, so twice as
 * many callers is a step and eight times is a fifth.
 */
export function interval(from: StructureNode, to: StructureNode): number {
  const ratio = Math.log2((to.fanIn + 1) / (from.fanIn + 1))
  const size = Math.abs(ratio)
  const leap = LEAPS[size < 0.2 ? 0 : size < 1 ? 1 : size < 2.5 ? 2 : 3]!
  return ratio < 0 ? -leap : leap
}

/**
 * One dependency path as a motif. `subsystem` names the region it was read
 * from; the whole-repository theme has none.
 */
export function pathMotif(
  structure: Structure,
  path: readonly number[],
  id: string,
  subsystem?: string,
): Motif {
  const nodes = path.map((i) => structure.nodes[i]!)
  const notes: MotifNote[] = []
  let time = 0
  let degree = OPENINGS[quantise(nodes[0]!.rank.depth, 0, OPENINGS.length - 1)]!
  for (const [k, node] of nodes.entries()) {
    const previous = nodes[k - 1]
    const duration =
      DURATIONS[quantise(node.rank.fanOut, 0, DURATIONS.length - 1)]!
    // Crossing into another folder is a new clause, so leave a gap.
    const start =
      previous && folder(previous) !== folder(node) ? time + BREATH : time
    if (start + duration > MAX_BEATS) break
    if (previous) degree = fold(degree + interval(previous, node))
    notes.push({
      degree,
      start,
      duration,
      // Accent the downbeats, so the phrase has a metre as well as a line.
      velocity: start % BAR === 0 ? 100 : start % 1 === 0 ? 86 : 74,
    })
    time = start + duration
  }
  const last = notes.at(-1)!
  notes[notes.length - 1] = { ...last, degree: settle(last.degree) }
  return {
    id,
    source: {
      project: nodes[0]!.project,
      subsystem,
      // Only the files that made it into the motif, so provenance never names
      // a file you cannot hear.
      files: nodes.slice(0, notes.length).map((n) => n.path),
      structure: 'dependency-path',
    },
    notes,
    // Whole bars, so motifs placed back to back stay on the downbeat.
    length: Math.max(BAR, Math.ceil(time / BAR) * BAR),
  }
}
