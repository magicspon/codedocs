/**
 * Lead motifs from dependency paths: each file on the chain is one note, and
 * how the file sits in the graph decides its step, length and weight.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'

/** A motif never runs past two bars, so it can recur inside short sections. */
const MAX_BEATS = 8
const BAR = 4

/**
 * Scale steps from one note to the next, chosen by the next file's fan-in.
 * Thirds dominate, so an average chain climbs like an arpeggio; a file few
 * things use steps down.
 */
const STEPS = [-2, -1, 1, 2, 2, 3]

/** Note lengths in beats, chosen by fan-out: a file that does a lot moves fast. */
const DURATIONS = [2, 1.5, 1, 0.5]

/** Keeps a long climb inside a playable range around the tonic. */
function fold(degree: number): number {
  if (degree > 9) return degree - 7
  if (degree < -3) return degree + 7
  return degree
}

/**
 * One file as one note. The first file's depth picks where the phrase starts
 * (not its centrality: paths start from the most central files, so that would
 * start every phrase on the same note). Every later note moves from the one
 * before.
 */
function noteFor(node: StructureNode, previous: number | undefined): number {
  if (previous === undefined) return quantise(node.rank.depth, 0, 4)
  return fold(previous + STEPS[quantise(node.rank.fanIn, 0, STEPS.length - 1)]!)
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
  let degree: number | undefined
  for (const node of nodes) {
    const duration =
      DURATIONS[quantise(node.rank.fanOut, 0, DURATIONS.length - 1)]!
    if (time + duration > MAX_BEATS) break
    degree = noteFor(node, degree)
    notes.push({
      degree,
      start: time,
      duration,
      velocity: 70 + quantise(node.rank.centrality, 0, 40),
    })
    time += duration
  }
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
