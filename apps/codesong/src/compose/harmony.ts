/**
 * Harmony and bass for one subsystem. Each of its largest clusters is one
 * chord, voiced by the cluster's most central file: a group of files that
 * work together becomes a group of notes that sound together.
 */

import type { Motif, MotifNote, Provenance } from '../model.ts'
import type { Region } from '../regions.ts'
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

/** Files that voice a region's chords, one per chord. */
export interface ChordSource {
  readonly nodes: readonly StructureNode[]
  readonly structure: Provenance['structure']
}

/**
 * The most central file of each of the region's largest clusters. A region
 * with fewer than two clusters has no harmonic groups to read, so its most
 * central files stand in, and the provenance says so.
 */
export function chordSource(structure: Structure, region: Region): ChordSource {
  const heads = region.clusters.slice(0, CHORDS).map((c) => c[0]!)
  const files = heads.length >= 2 ? heads : region.files.slice(0, CHORDS)
  return {
    nodes: files.map((i) => structure.nodes[i]!),
    structure: heads.length >= 2 ? 'clusters' : 'central-files',
  }
}

/**
 * One chord root per file. The first is always the tonic: the most central
 * file is the region's home. The rest are chosen by how deep the file sits,
 * and never repeat the chord before them.
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

function provenance(region: Region, source: ChordSource): Provenance {
  return {
    project: source.nodes[0]?.project,
    subsystem: region.path,
    files: source.nodes.map((n) => n.path),
    structure: source.structure,
  }
}

/**
 * Sustained chords, one bar each. A region denser than the codebase around
 * it adds the seventh: tangled code, richer chords.
 */
export function padMotif(
  structure: Structure,
  region: Region,
  source: ChordSource,
): Motif {
  const roots = progression(source.nodes)
  const tones = region.density > structure.meanFanOut ? [0, 2, 4, 6] : [0, 2, 4]
  const velocity = 56 + quantise(region.density / (region.density + 4), 0, 32)
  const notes: MotifNote[] = roots.flatMap((root, bar) =>
    tones.map((tone) => ({
      degree: root + tone,
      start: bar * BAR,
      duration: BAR,
      velocity,
    })),
  )
  return {
    id: `pad:${region.path}`,
    source: provenance(region, source),
    notes,
    length: roots.length * BAR,
  }
}

/**
 * The chord roots again, with a rhythm per bar from that chord's file: a file
 * that depends on a lot pulses faster. Past two notes a bar, every other note
 * is the fifth, so busy bass lines still outline the chord.
 */
export function bassMotif(region: Region, source: ChordSource): Motif {
  const roots = progression(source.nodes)
  const notes: MotifNote[] = roots.flatMap((root, bar) => {
    const node = source.nodes[bar]!
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
    id: `bass:${region.path}`,
    source: provenance(region, source),
    notes,
    length: roots.length * BAR,
  }
}
