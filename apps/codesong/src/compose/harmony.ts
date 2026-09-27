/**
 * Harmony and bass from the most central files: the code everything leans on
 * becomes the chords everything sits on.
 */

import type { Motif, MotifNote, Provenance } from '../model.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'

/** Chords per progression, one per bar. */
const CHORDS = 4
const BAR = 4

/**
 * Chord roots after the tonic, as scale degrees: IV, V, vi, ii, iii. Ordered
 * from most to least stable, so shallow files pick the steadier chords.
 */
const ROOTS = [3, 4, 5, 1, 2]

/** The `CHORDS` most central files, most central first. */
export function centralFiles(structure: Structure): number[] {
  return structure.nodes
    .map((node, i) => ({ node, i }))
    .sort((a, b) => b.node.centrality - a.node.centrality || a.i - b.i)
    .slice(0, CHORDS)
    .map(({ i }) => i)
}

/**
 * One chord root per central file. The first is always the tonic: the most
 * central file is the piece's home. The rest are chosen by how deep the file
 * sits, and never repeat the chord before them.
 */
export function progression(nodes: readonly StructureNode[]): number[] {
  const roots: number[] = []
  for (const node of nodes) {
    if (roots.length === 0) {
      roots.push(0)
      continue
    }
    let pick = quantise(node.rank.depth, 0, ROOTS.length - 1)
    if (ROOTS[pick] === roots.at(-1)) pick = (pick + 1) % ROOTS.length
    roots.push(ROOTS[pick]!)
  }
  return roots
}

function provenance(nodes: readonly StructureNode[]): Provenance {
  return {
    project: nodes[0]?.project,
    files: nodes.map((n) => n.path),
    structure: 'central-files',
  }
}

/**
 * Sustained triads, one bar each. Louder when the graph is dense: a tangled
 * codebase makes a thicker pad.
 */
export function padMotif(
  structure: Structure,
  nodes: readonly StructureNode[],
): Motif {
  const roots = progression(nodes)
  const velocity =
    56 + quantise(structure.meanFanOut / (structure.meanFanOut + 4), 0, 32)
  const notes: MotifNote[] = roots.flatMap((root, bar) =>
    [0, 2, 4].map((third) => ({
      degree: root + third,
      start: bar * BAR,
      duration: BAR,
      velocity,
    })),
  )
  return {
    id: 'pad-progression',
    source: provenance(nodes),
    notes,
    length: roots.length * BAR,
  }
}

/**
 * The chord roots again, with a rhythm per bar from that bar's file: a file
 * that depends on a lot pulses faster. Past two notes a bar, every other note
 * is the fifth, so busy bass lines still outline the chord.
 */
export function bassMotif(nodes: readonly StructureNode[]): Motif {
  const roots = progression(nodes)
  const notes: MotifNote[] = roots.flatMap((root, bar) => {
    const node = nodes[bar]!
    const pulses = [1, 2, 4, 8][quantise(node.rank.fanOut, 0, 3)]!
    const step = BAR / pulses
    const velocity = 80 + quantise(node.rank.centrality, 0, 30)
    return Array.from({ length: pulses }, (_, k) => ({
      degree: pulses > 2 && k % 2 === 1 ? root + 4 : root,
      start: bar * BAR + k * step,
      duration: step * 0.9,
      velocity: k === 0 ? velocity : velocity - 12,
    }))
  })
  return {
    id: 'bass-line',
    source: provenance(nodes),
    notes,
    length: roots.length * BAR,
  }
}
