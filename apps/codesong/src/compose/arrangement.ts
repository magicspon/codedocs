/**
 * The form of the piece and which motifs play where. Phase 1 uses one fixed
 * five-part form; the code decides what fills it, the seed decides the order.
 */

import type { Motif, Part, Section, Transform } from '../model.ts'

const BAR = 4

const PLAIN: Transform = { transpose: 0, invert: false, octave: 0 }
/** The development answers the theme upside down and a third higher. */
const DEVELOPED: Transform = { transpose: 2, invert: true, octave: 0 }

/**
 * Intro, theme, development, return, outro in the proportions 1:2:2:2:1. The
 * outro absorbs any bars the division leaves over.
 */
export function sections(bars: number): Section[] {
  const unit = Math.max(1, Math.round(bars / 8))
  const plan: [string, number, number][] = [
    ['intro', unit, 0.3],
    ['theme', unit * 2, 0.6],
    ['development', unit * 2, 0.9],
    ['return', unit * 2, 0.8],
    ['outro', Math.max(1, bars - unit * 7), 0.3],
  ]
  let start = 0
  return plan.map(([name, length, intensity]) => {
    const section = { name, start, length: length * BAR, intensity }
    start += length * BAR
    return section
  })
}

/** One part that lasts the whole section. */
export function span(
  motif: string,
  section: Section,
  transform: Transform = PLAIN,
): Part {
  return { motif, start: section.start, length: section.length, transform }
}

/**
 * Lead motifs back to back from `first` until the section is full, the last
 * one cut short if it does not fit.
 */
export function fill(
  motifs: readonly Motif[],
  section: Section,
  first: number,
  transform: Transform,
): Part[] {
  const parts: Part[] = []
  const end = section.start + section.length
  let time = section.start
  let i = first
  while (time < end && motifs.length > 0) {
    const motif = motifs[i % motifs.length]!
    const length = Math.min(motif.length, end - time)
    parts.push({ motif: motif.id, start: time, length, transform })
    time += length
    i++
  }
  return parts
}

/** The lead across the form: silent in the intro, one motif to close. */
export function leadParts(
  motifs: readonly Motif[],
  form: readonly Section[],
  random: () => number,
): Part[] {
  // The seed picks where each section enters the cycle of motifs.
  const offset = (): number => Math.floor(random() * motifs.length)
  const [, theme, development, reprise, outro] = form
  const parts = [
    ...fill(motifs, theme!, offset(), PLAIN),
    ...fill(motifs, development!, offset(), DEVELOPED),
    ...fill(motifs, reprise!, offset(), PLAIN),
  ]
  const closing = motifs[0]
  if (closing) {
    parts.push({
      motif: closing.id,
      start: outro!.start,
      length: Math.min(closing.length, outro!.length),
      transform: PLAIN,
    })
  }
  return parts
}
