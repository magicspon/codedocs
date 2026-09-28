/**
 * The pad: a region's chords as the genre plays them. The code decides the
 * chords and how rich they are; the genre decides the rhythm, and the chord's
 * file fills in the rhythm where the genre leaves room.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Region } from '../regions.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'
import type { Genre, PadStyle } from './genre.ts'
import { provenance, turns, type ChordSource } from './harmony.ts'

const BAR = 4

/** Chord tones above the root, as scale steps: a triad, a seventh, a ninth. */
const TRIAD = [0, 2, 4]
const SEVENTH = [0, 2, 4, 6]
const NINTH = [0, 2, 4, 6, 8]

/**
 * The chord tones for a region. A region denser than the codebase around it
 * adds the seventh: tangled code, richer chords. With `sevenths`, the genre
 * always adds it, and dense code adds the ninth as well.
 */
export function voicing(
  structure: Structure,
  region: Region,
  sevenths: boolean,
) {
  const dense = region.density > structure.meanFanOut
  if (sevenths) return dense ? NINTH : SEVENTH
  return dense ? SEVENTH : TRIAD
}

/** One strike of the chord, starts relative to the bar; soft is an off-beat. */
type Hit = readonly [start: number, duration: number, soft?: boolean]

/**
 * Each pad style's strikes in one bar. A file that depends on a lot (fan-out
 * past half) adds a strike where the style has room for one.
 */
const PAD: Readonly<Record<PadStyle, (node: StructureNode) => Hit[]>> = {
  held: () => [[0, BAR]],
  push: () => [
    [0, 2.5],
    [2.5, 1.5, true],
  ],
  stab: (node) =>
    node.rank.fanOut > 0.5
      ? [
          [0, 0.35],
          [0.75, 0.35, true],
          [1.5, 0.35],
          [2.5, 0.35, true],
          [3, 0.35],
        ]
      : [
          [0, 0.35],
          [1.5, 0.35, true],
          [3, 0.35],
        ],
  // The busy file anticipates the next bar on the and-of-four.
  comp: (node) => [
    [0, 1.2],
    [1.5, 0.9, true],
    ...(node.rank.fanOut > 0.5 ? [[3.5, 0.4, true] as const] : []),
  ],
}

/** A region's pads: as the genre plays them, and held. */
export interface Pads {
  /** The call, then the answer, in the genre's style. */
  readonly played: readonly Motif[]
  /** The same chords held a bar each; `played` itself when the style holds. */
  readonly held: readonly Motif[]
}

/** The call then the answer, one chord a bar, in `style`. */
function padMotifs(
  structure: Structure,
  region: Region,
  source: ChordSource,
  sevenths: boolean,
  style: PadStyle,
): Motif[] {
  const tones = voicing(structure, region, sevenths)
  const velocity = 56 + quantise(region.density / (region.density + 4), 0, 32)
  const suffix = style === 'held' ? '' : `:${style}`
  return turns(source).map(({ roots, suffix: turn }) => ({
    id: `pad:${region.path}${turn}${suffix}`,
    source: provenance(region, source),
    notes: roots.flatMap((root, bar) =>
      PAD[style](source.nodes[bar]!).flatMap(([start, duration, soft]) =>
        tones.map((tone): MotifNote => ({
          degree: root + tone,
          start: bar * BAR + start,
          duration,
          velocity: soft ? velocity - 12 : velocity,
        })),
      ),
    ),
    length: roots.length * BAR,
  }))
}

/** The region's chords, voiced as `voicing` says, played and held. */
export function pads(
  structure: Structure,
  region: Region,
  source: ChordSource,
  genre: Pick<Genre, 'sevenths' | 'pad'>,
): Pads {
  const held = padMotifs(structure, region, source, genre.sevenths, 'held')
  return {
    held,
    played:
      genre.pad === 'held'
        ? held
        : padMotifs(structure, region, source, genre.sevenths, genre.pad),
  }
}
