/**
 * Which tracks play what in each kind of section. The form decides the
 * texture; the subsystem supplies the material; the theme ties the sections
 * together by coming back, changed, in every one of them.
 */

import type { Motif, MusicalRole, Part, Section, Transform } from '../model.ts'
import type { Genre } from './genre.ts'

const BAR = 4

/** What one subsystem gives its section. */
export interface Material {
  /** The chords in the genre's rhythm: the call, then the answer. */
  readonly pad: readonly Motif[]
  /** The same chords held a bar each. */
  readonly held: readonly Motif[]
  readonly bass: readonly Motif[]
  /** Empty when the subsystem has no dependency cycle. */
  readonly arp: readonly Motif[]
  /** Melodic motifs from the subsystem's own dependency paths; may be empty. */
  readonly phrases: readonly Motif[]
  readonly groove: Motif
  readonly fill: Motif
}

/** Parts for one section, by role. */
export type SectionParts = Partial<Record<MusicalRole, Part[]>>

/** A transform shifted into the section's harmonic area. */
export function shift(area: number, extra: Partial<Transform> = {}): Transform {
  return { transpose: area, invert: false, octave: 0, stretch: 1, ...extra }
}

/** One part over `[start, start + length)` of a section. */
function part(
  motif: Motif,
  start: number,
  length: number,
  transform: Transform,
): Part {
  return { motif: motif.id, start, length, transform }
}

/** One part that lasts the whole section. */
function span(motif: Motif, section: Section, transform: Transform): Part {
  return part(motif, section.start, section.length, transform)
}

/**
 * Motifs back to back from `first` until the section is full, the last one
 * cut short if it does not fit.
 */
export function sequence(
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
    const length = Math.min(motif.length * transform.stretch, end - time)
    parts.push(part(motif, time, length, transform))
    time += length
    i++
  }
  return parts
}

/** The groove until the last bar, then the fill into the next section. */
function drums(material: Material, section: Section): Part[] {
  const end = section.start + section.length
  const plain = shift(0)
  return [
    part(material.groove, section.start, section.length - BAR, plain),
    part(material.fill, end - BAR, BAR, plain),
  ]
}

/** The theme's opening, as a link into the next section over its last bars. */
function motto(
  theme: Motif,
  section: Section,
  notes: number,
  bars: number,
  stretch: number,
): Part {
  const length = Math.min(bars * BAR, section.length)
  return part(
    theme,
    section.start + section.length - length,
    length,
    shift(section.area, { fragment: notes, stretch }),
  )
}

/** What every kind of section builds its parts from. */
interface Scene {
  readonly section: Section
  readonly material: Material
  readonly theme: Motif
  /** Where the counter-melody enters its cycle of phrases. */
  readonly offset: number
  /** Multiplies the time of the melodies. */
  readonly m: number
  /** The section's harmonic area, for accompaniment. */
  readonly home: Transform
  /** The harmonic area at the melodies' speed. */
  readonly tune: Transform
  /** Half the section in whole bars. */
  readonly half: number
}

/**
 * Call and answer back to back over `[from, from + length)` of the section,
 * taking up where they would be had they played from its start, so a part
 * that enters late still lines up with the chords.
 */
function inTurn(
  motifs: readonly Motif[],
  c: Scene,
  from = 0,
  length = c.section.length - from,
): Part[] {
  const unit = motifs[0]?.length ?? BAR
  const window = { ...c.section, start: c.section.start + from, length }
  return sequence(motifs, window, Math.floor(from / unit), c.home)
}

/** The chords in the genre's rhythm, for the sections with a groove. */
const pad = (c: Scene): Part[] => inTurn(c.material.pad, c)

/** The chords held, for the sections that open, break down and close. */
const held = (c: Scene): Part[] => inTurn(c.material.held, c)

/** The arpeggio over the whole section, if the subsystem has one. */
const loop = (c: Scene): Part[] => inTurn(c.material.arp, c)

/** The subsystem's own phrases, back to back, in `transform`. */
const phrases = (c: Scene, transform: Transform): Part[] =>
  sequence(c.material.phrases, c.section, c.offset, transform)

/** Each kind of section's texture. */
const TEXTURES: Readonly<Record<Section['form'], (c: Scene) => SectionParts>> =
  {
    // The theme at half speed over held chords; the loop creeps in halfway.
    intro: (c) => ({
      pad: held(c),
      lead: [
        span(c.theme, c.section, shift(0, { stretch: 2 * c.m, octave: -1 })),
      ],
      arp: inTurn(c.material.arp, c, c.half),
      percussion: drums(c.material, c.section),
    }),
    verse: (c) => ({
      pad: pad(c),
      bass: inTurn(c.material.bass, c),
      counter: phrases(c, c.tune),
      lead: [motto(c.theme, c.section, 3, 2, c.m)],
      arp: c.section.intensity >= 0.6 ? loop(c) : [],
      percussion: drums(c.material, c.section),
    }),
    // Everything at once, the theme in full and at home.
    chorus: (c) => ({
      pad: pad(c),
      bass: inTurn(c.material.bass, c),
      counter: phrases(c, c.tune),
      lead: [span(c.theme, c.section, shift(0, { stretch: c.m }))],
      arp: loop(c),
      percussion: drums(c.material, c.section),
    }),
    // No bass or drums: the loop, held chords and the phrases upside down.
    breakdown: (c) => ({
      pad: held(c),
      counter: phrases(c, { ...c.tune, invert: true }),
      lead: [motto(c.theme, c.section, 2, 4, c.m)],
      arp: loop(c),
    }),
    // The theme once more, then again at half speed as the bass drops out.
    outro: (c) => ({
      pad: held(c),
      bass: inTurn(c.material.bass, c, 0, c.half),
      lead: [
        part(c.theme, c.section.start, c.half, shift(0, { stretch: c.m })),
        part(
          c.theme,
          c.section.start + c.half,
          c.section.length - c.half,
          shift(0, { stretch: 2 * c.m }),
        ),
      ],
    }),
  }

/**
 * Every role's parts for one section, in `genre`. `offset` is where the
 * counter-melody enters its cycle of phrases, which the seed chooses.
 */
export function arrange(
  section: Section,
  material: Material,
  theme: Motif,
  offset: number,
  genre: Pick<Genre, 'melody' | 'rests'>,
): SectionParts {
  const m = genre.melody
  const parts = TEXTURES[section.form]({
    section,
    material,
    theme,
    offset,
    m,
    home: shift(section.area),
    tune: shift(section.area, { stretch: m }),
    half: Math.max(BAR, Math.floor(section.length / 2 / BAR) * BAR),
  })
  for (const role of genre.rests[section.form] ?? []) delete parts[role]
  return parts
}
