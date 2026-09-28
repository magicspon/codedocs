/**
 * Arpeggios from dependency cycles. Files that depend on each other in a
 * loop become a figure that loops: an ostinato over the region's chords.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Region } from '../regions.ts'
import type { Structure } from '../structure.ts'
import { quantise } from '../theory.ts'
import { turns, type ChordSource } from './harmony.ts'

const BAR = 4
/** Longest figure; a cycle of hundreds of files still loops in eight steps. */
const MAX_STEPS = 8
/** Chord tones a step can land on: root, third, fifth, octave. */
const TONES = [0, 2, 4, 7]

/**
 * The region's largest cycle as an arpeggio over its call and answer, or
 * nothing when the region has no cycle: an acyclic subsystem does not get a
 * loop.
 *
 * Each file in the cycle is one step, landing on the chord tone its depth
 * picks. A long cycle runs in sixteenths, a short one in eighths.
 */
export function arpMotifs(
  structure: Structure,
  region: Region,
  chords: ChordSource,
): Motif[] {
  const cycle = region.cycles[0]
  if (cycle === undefined) return []
  const members = cycle.slice(0, MAX_STEPS).map((i) => structure.nodes[i]!)
  const figure = members.map(
    (n) => TONES[quantise(n.rank.depth, 0, TONES.length - 1)]!,
  )
  const step = cycle.length >= 6 ? 0.25 : 0.5
  return turns(chords).map(({ roots, suffix }) => {
    const notes: MotifNote[] = []
    let k = 0
    roots.forEach((root, bar) => {
      for (let t = 0; t < BAR; t += step) {
        notes.push({
          degree: root + figure[k % figure.length]!,
          start: bar * BAR + t,
          duration: step * 0.8,
          // The figure's first step is accented, so the loop is audible as one.
          velocity: k % figure.length === 0 ? 92 : 70,
        })
        k++
      }
    })
    return {
      id: `arp:${region.path}${suffix}`,
      source: {
        project: members[0]?.project,
        subsystem: region.path,
        files: members.map((n) => n.path),
        structure: 'cycle',
      },
      notes,
      length: roots.length * BAR,
    }
  })
}
