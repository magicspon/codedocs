/**
 * Harmony and bass for one subsystem. Each of its largest clusters is one
 * chord, voiced by the cluster's most central file: a group of files that
 * work together becomes a group of notes that sound together. The pad that
 * plays the chords is in `pad.ts`.
 */

import type { Motif, MotifNote, Provenance } from '../model.ts'
import type { Region } from '../regions.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'
import type { BassStyle } from './genre.ts'

/** Chords per progression, one per bar. */
const CHORDS = 4
const BAR = 4

/**
 * Where each chord root (a scale degree) may go next, ordered from the
 * steadiest move to the most restless. Tonic chords (I, iii, vi) open out,
 * the subdominants (ii, IV) lean on, and the dominant (V) resolves: common
 * practice, so any path through it sounds like a progression.
 */
const NEXT: Readonly<Record<number, readonly number[]>> = {
  0: [5, 3, 2, 1, 4],
  1: [5, 4],
  2: [5, 3, 1],
  3: [0, 1, 4],
  4: [0, 5, 3],
  5: [3, 1, 2, 4],
}

/**
 * How far a rise or fall in tension between neighbouring chord files swings
 * the choice: at 2, a quarter step either way reaches the ends of the list.
 */
const RISE = 2

/** Files that voice a region's chords, one per chord, and the chords they give. */
export interface ChordSource {
  readonly nodes: readonly StructureNode[]
  readonly structure: Provenance['structure']
  /** Chord roots as scale degrees, one per file; see `phrase`. */
  readonly call: readonly number[]
  /** The call's reply, absent when no other turn is open to it. */
  readonly answer?: readonly number[]
}

/**
 * The most central file of each of the region's largest clusters. A region
 * with fewer than two clusters has no harmonic groups to read, so its most
 * central files stand in, and the provenance says so.
 *
 * `taken` holds the progressions other regions of the piece already play, so
 * two subsystems do not share one; this region's is added to it.
 */
export function chordSource(
  structure: Structure,
  region: Region,
  taken: Set<string> = new Set(),
): ChordSource {
  const heads = region.clusters.slice(0, CHORDS).map((c) => c[0]!)
  const files = heads.length >= 2 ? heads : region.files.slice(0, CHORDS)
  const nodes = files.map((i) => structure.nodes[i]!)
  const { call, answer } = phrase(nodes, taken)
  taken.add(call.join())
  return {
    nodes,
    structure: heads.length >= 2 ? 'clusters' : 'central-files',
    call,
    ...(answer && { answer }),
  }
}

/** The call, then the answer if there is one, each with its motif id suffix. */
export function turns(
  source: ChordSource,
): { readonly roots: readonly number[]; readonly suffix: string }[] {
  const call = { roots: source.call, suffix: '' }
  return source.answer
    ? [call, { roots: source.answer, suffix: ':answer' }]
    : [call]
}

/**
 * How restless a file is, 0–1: deep, dependent on much and depended on by
 * little. Three ranks rather than depth alone, because depth takes only a
 * handful of values and would give most files the same chord.
 */
function tension(node: StructureNode): number {
  const { depth, fanOut, fanIn } = node.rank
  return (depth + fanOut + (1 - fanIn)) / 3
}

/** A progression and its reply: the same files, heard twice. */
export interface Phrase {
  readonly call: number[]
  readonly answer?: number[]
}

/** How many shifted walks `phrase` tries before it accepts a repeat. */
const VARIANTS = 5

/**
 * One chord root per file, twice. The first is always the tonic: the most
 * central file is the region's home. Each later file picks where the chord
 * before it may go: a file calmer than the one before takes a steadier move,
 * a more restless one a more restless move. Chords not heard yet come first,
 * and the last never lands on the tonic, which the loop is about to return to.
 *
 * When that call is already `taken`, every choice shifts one move along, and
 * again, until the result is new or the shifts run out. The answer keeps the
 * call's first half and shifts the rest, so a section does not loop four bars.
 */
export function phrase(
  nodes: readonly StructureNode[],
  taken: ReadonlySet<string> = new Set(),
): Phrase {
  const shifts = Array.from({ length: VARIANTS }, (_, s) => s)
  const shift = shifts.find((s) => !taken.has(walk(nodes, () => s).join())) ?? 0
  const call = walk(nodes, () => shift)
  const from = Math.ceil(nodes.length / 2)
  const answer = shifts
    .slice(1)
    .map((s) => walk(nodes, (i) => (i < from ? shift : shift + s)))
    .find((a) => a.join() !== call.join())
  return answer ? { call, answer } : { call }
}

/** The progression with each choice `i` moved `shift(i)` places along its list. */
function walk(
  nodes: readonly StructureNode[],
  shift: (i: number) => number,
): number[] {
  const tensions = nodes.map(tension)
  const roots: number[] = []
  nodes.forEach((_, i) => {
    if (i === 0) {
      roots.push(0)
      return
    }
    const last = i === nodes.length - 1
    const moves = NEXT[roots.at(-1)!]!.filter((r) => !(last && r === 0))
    const fresh = moves.filter((r) => !roots.includes(r))
    const options = fresh.length > 0 ? fresh : moves
    // Central files are all heavily depended on, so their tension bunches
    // up; the change from the file before is what tells them apart.
    const t = 0.5 + (tensions[i]! - tensions[i - 1]!) * RISE
    const pick = quantise(t, 0, options.length - 1) + shift(i)
    roots.push(options[pick % options.length]!)
  })
  return roots
}

/** Where a region's chord motifs say they came from. */
export function provenance(region: Region, source: ChordSource): Provenance {
  return {
    project: source.nodes[0]?.project,
    subsystem: region.path,
    files: source.nodes.map((n) => n.path),
    structure: source.structure,
  }
}

/** What one bar of bass is built from. */
interface BassBar {
  readonly root: number
  /** The next bar's root, which a walking line steps towards. */
  readonly next: number
  readonly node: StructureNode
  /** A note, accented or not, at the bar's velocity. */
  readonly note: (
    degree: number,
    start: number,
    duration: number,
    accent: boolean,
  ) => MotifNote
}

/** Each bass style's bar, starts relative to the bar. */
const BASS: Readonly<Record<BassStyle, (b: BassBar) => MotifNote[]>> = {
  held: ({ root, note }) => [note(root, 0, BAR, true)],
  // A file that depends on a lot moves to the fifth halfway through.
  sub: ({ root, node, note }) => [
    note(root, 0, 2, true),
    note(node.rank.fanOut > 0.5 ? root + 4 : root, 2, 2, false),
  ],
  // Between the kicks, jumping the octave on the and-of-two and -four.
  offbeat: ({ root, note }) =>
    [0, 1, 2, 3].map((beat) =>
      note(beat % 2 === 1 ? root + 7 : root, beat + 0.5, 0.45, beat === 0),
    ),
  // Past two notes a bar, every other is the fifth, so busy lines still
  // outline the chord.
  pulse: ({ root, node, note }) => {
    const pulses = [1, 2, 4, 8][quantise(node.rank.fanOut, 0, 3)]!
    const step = BAR / pulses
    return Array.from({ length: pulses }, (_, k) =>
      note(
        pulses > 2 && k % 2 === 1 ? root + 4 : root,
        k * step,
        step * 0.9,
        k === 0,
      ),
    )
  },
  // Root, through the chord, then a step from the next root: a file that
  // depends on a lot walks up, one that depends on little walks down.
  walking: ({ root, next, node, note }) => {
    const up = node.rank.fanOut > 0.5
    const line = up
      ? [root, root + 2, root + 4, next - 1]
      : [root, root - 1, root - 3, next + 1]
    return line.map((degree, beat) => note(degree, beat, 0.9, beat === 0))
  },
}

/** One bar of bass under `root` in `style`. */
function bar(
  style: BassStyle,
  root: number,
  next: number,
  node: StructureNode,
): MotifNote[] {
  const velocity = 80 + quantise(node.rank.centrality, 0, 30)
  const note = (
    degree: number,
    start: number,
    duration: number,
    accent: boolean,
  ): MotifNote => ({
    degree,
    start,
    duration,
    velocity: accent ? velocity : velocity - 12,
  })
  return BASS[style]({ root, next, node, note })
}

/**
 * The chord roots again, one bar each, in the genre's bass style: the call,
 * then the answer. Where the style leaves room, the chord's file decides the
 * rhythm: a file that depends on a lot moves more.
 */
export function bassMotifs(
  region: Region,
  source: ChordSource,
  style: BassStyle = 'pulse',
): Motif[] {
  return turns(source).map(({ roots, suffix }) => ({
    id: `bass:${region.path}${suffix}`,
    source: provenance(region, source),
    notes: roots.flatMap((root, i) =>
      // Call and answer both start home, so the last bar walks back to it.
      bar(style, root, roots[(i + 1) % roots.length]!, source.nodes[i]!).map(
        (n) => ({ ...n, start: i * BAR + n.start }),
      ),
    ),
    length: roots.length * BAR,
  }))
}
