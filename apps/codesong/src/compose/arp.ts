/**
 * Arpeggios from dependency cycles. Files that depend on each other in a
 * loop become a figure that loops: an ostinato over the region's chords.
 *
 * The code decides the notes, their order and where the figure rests; the
 * genre's `ArpStyle` decides the speed, the range and the shape.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Region } from '../regions.ts'
import type { Structure, StructureNode } from '../structure.ts'
import { quantise } from '../theory.ts'
import { euclid } from './rhythm.ts'
import type { ArpStyle, Genre } from './genre.ts'
import { tension, turns, type ChordSource } from './harmony.ts'
import { voicing } from './pad.ts'

const BAR = 4
/** Longest figure; a cycle of hundreds of files still loops in eight steps. */
const MAX_STEPS = 8
/** Even a loop of two files outlines a chord: root, middle and top. */
const MIN_TONES = 3
const OCTAVE = 7

/** How one style plays a figure. */
interface Play {
  /** Beats per step. */
  readonly step: number
  /** Octaves of chord tones the figure spreads over. */
  readonly span: number
  /** How much of its step a note sounds; past 1 the notes overlap. */
  readonly gate: number
  /** The figure, from the tones three ways: see `Tones`. */
  readonly shape: (tones: Tones) => number[]
}

/** A cycle's tones, ordered three ways. */
interface Tones {
  /** In the files' order, most central first. */
  readonly code: number[]
  /** Lowest first. */
  readonly low: number[]
  /**
   * In pitch order from the most central file's tone, up when that file
   * depends on a lot and down when it does not, wrapping round. Two loops
   * of the same size would otherwise play the same scale run.
   */
  readonly run: number[]
}

/** `tones` turned to start at `first`. */
function from(tones: number[], first: number): number[] {
  const at = Math.max(0, tones.indexOf(first))
  return [...tones.slice(at), ...tones.slice(0, at)]
}

/** There and back without repeating the ends. */
const upDown = (tones: number[]): number[] => [
  ...tones,
  ...tones.slice(1, -1).reverse(),
]

/** The lowest tone between each of the others: a techno pedal. */
const pedal = ({ code, low }: Tones): number[] =>
  code.filter((t) => t !== low[0]).flatMap((t) => [low[0]!, t])

/**
 * Low and high hands in turn, cut to an odd length and starting from the
 * most central file's tone. An odd figure never fits a bar of sixteenths,
 * so it lands somewhere new each bar: the polymeter math rock is built on.
 */
function tapped({ code, low }: Tones): number[] {
  const half = Math.ceil(low.length / 2)
  const hands = low
    .slice(0, half)
    .flatMap((t, i) => [
      t,
      ...(low[half + i] === undefined ? [] : [low[half + i]!]),
    ])
  return from(hands.length % 2 === 0 ? hands.slice(0, -1) : hands, code[0]!)
}

const PLAY: Readonly<Record<ArpStyle, Play>> = {
  // Slow and wide, each note ringing into the next.
  drift: { step: 0.5, span: 2, gate: 1.8, shape: ({ run }) => upDown(run) },
  // A lazy broken chord, in the order the files come.
  broken: { step: 0.5, span: 1, gate: 0.7, shape: ({ code }) => code },
  pedal: { step: 0.25, span: 1, gate: 0.5, shape: pedal },
  // Runs over two octaves.
  roll: { step: 0.25, span: 2, gate: 0.6, shape: ({ run }) => run },
  // Eighth-note triplets through the chord and back, sevenths and all.
  triplet: { step: 1 / 3, span: 1, gate: 0.8, shape: ({ run }) => upDown(run) },
  tapped: { step: 0.25, span: 2, gate: 0.9, shape: tapped },
}

/** The chord tones over `span` octaves, and the root on top. */
function ladder(tones: readonly number[], span: number): number[] {
  const steps = Array.from({ length: span }, (_, o) =>
    tones.map((t) => t + o * OCTAVE),
  ).flat()
  return [...new Set([...steps, span * OCTAVE])].sort((a, b) => a - b)
}

/**
 * One tone per file, in the files' order, plus any the chord needs to make
 * three. Files are ranked against each other by tension, not placed by
 * their own depth: files in a loop sit at about the same depth, which gave
 * every step the same note.
 */
function tones(members: readonly StructureNode[], rungs: number[]): number[] {
  const count = Math.max(members.length, MIN_TONES)
  const slot = (rank: number) =>
    rungs[Math.round((rank * (rungs.length - 1)) / Math.max(1, count - 1))]!
  const byTension = members
    .map((n, i) => ({ i, t: tension(n) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
  const code: number[] = []
  byTension.forEach(({ i }, rank) => (code[i] = slot(rank)))
  for (let rank = members.length; rank < count; rank++) code.push(slot(rank))
  return code
}

/**
 * Which of a bar's steps play. A loop that holds much of its region plays
 * every step; a small one leaves up to a quarter of them empty, spread
 * evenly, the downbeat always sounding.
 */
function gates(region: Region, cycle: readonly number[], steps: number) {
  const share = Math.min(1, (cycle.length / region.files.length) * 3)
  const rests = quantise(1 - share, 0, Math.floor(steps / 4))
  return euclid(steps - rests, steps)
}

/** The figure over one turn of chords, and the files it came from. */
function figure(
  structure: Structure,
  region: Region,
  cycle: readonly number[],
  roots: readonly number[],
  rungs: number[],
  play: Play,
) {
  const members = cycle.slice(0, MAX_STEPS).map((i) => structure.nodes[i]!)
  const code = tones(members, rungs)
  const low = [...new Set(code)].sort((a, b) => a - b)
  const leans = members[0]!.rank.fanOut >= 0.5
  const run = from(leans ? low : [...low].reverse(), code[0]!)
  const shape = play.shape({ code, low, run })
  const steps = Math.round(BAR / play.step)
  const open = gates(region, cycle, steps)
  const notes: MotifNote[] = []
  // The figure advances only on notes that sound, so rests shift it
  // against the bar rather than cutting pieces out of it.
  let k = 0
  roots.forEach((root, bar) => {
    open.forEach((sounds, s) => {
      if (!sounds) return
      notes.push({
        degree: root + shape[k % shape.length]!,
        start: bar * BAR + s * play.step,
        duration: play.step * play.gate,
        // The figure's first step is accented, so the loop is audible as one.
        velocity: k % shape.length === 0 ? 92 : 70,
      })
      k++
    })
  })
  return { members, notes }
}

/**
 * The region's cycles as arpeggios over its call and answer, or nothing when
 * the region has no cycle: an acyclic subsystem does not get a loop. The
 * answer plays the second-largest cycle, or the first backwards.
 */
export function arpMotifs(
  structure: Structure,
  region: Region,
  chords: ChordSource,
  genre: Pick<Genre, 'arp' | 'sevenths'>,
): Motif[] {
  const [first, second] = region.cycles
  if (first === undefined) return []
  const play = PLAY[genre.arp]
  const rungs = ladder(voicing(structure, region, genre.sevenths), play.span)
  return turns(chords).map(({ roots, suffix }) => {
    const cycle = suffix === '' ? first : (second ?? [...first].reverse())
    const { members, notes } = figure(
      structure,
      region,
      cycle,
      roots,
      rungs,
      play,
    )
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
