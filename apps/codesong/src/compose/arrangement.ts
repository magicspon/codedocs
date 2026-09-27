/**
 * Which tracks play what in each kind of section. The form decides the
 * texture; the subsystem supplies the material; the theme ties the sections
 * together by coming back, changed, in every one of them.
 */

import type { Motif, MusicalRole, Part, Section, Transform } from '../model.ts'

const BAR = 4

/** What one subsystem gives its section. */
export interface Material {
  readonly pad: Motif
  readonly bass: Motif
  /** Absent when the subsystem has no dependency cycle. */
  readonly arp?: Motif
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
): Part {
  const length = Math.min(bars * BAR, section.length)
  return part(
    theme,
    section.start + section.length - length,
    length,
    shift(section.area, { fragment: notes }),
  )
}

/**
 * Every role's parts for one section. `offset` is where the counter-melody
 * enters its cycle of phrases, which the seed chooses.
 */
export function arrange(
  section: Section,
  material: Material,
  theme: Motif,
  offset: number,
): SectionParts {
  const home = shift(section.area)
  const half = Math.max(BAR, Math.floor(section.length / 2 / BAR) * BAR)
  const { arp } = material
  switch (section.form) {
    case 'intro':
      // The theme at half speed over a bare pad; the loop creeps in halfway.
      return {
        pad: [span(material.pad, section, home)],
        lead: [span(theme, section, shift(0, { stretch: 2, octave: -1 }))],
        arp: arp
          ? [part(arp, section.start + half, section.length - half, home)]
          : [],
        percussion: drums(material, section),
      }
    case 'verse':
      return {
        pad: [span(material.pad, section, home)],
        bass: [span(material.bass, section, home)],
        counter: sequence(material.phrases, section, offset, home),
        lead: [motto(theme, section, 3, 2)],
        arp: arp && section.intensity >= 0.6 ? [span(arp, section, home)] : [],
        percussion: drums(material, section),
      }
    case 'chorus':
      // Everything at once, the theme in full and at home.
      return {
        pad: [span(material.pad, section, home)],
        bass: [span(material.bass, section, home)],
        counter: sequence(material.phrases, section, offset, home),
        lead: [span(theme, section, shift(0))],
        arp: arp ? [span(arp, section, home)] : [],
        percussion: drums(material, section),
      }
    case 'breakdown':
      // No bass or drums: the loop, the pad and the phrases upside down.
      return {
        pad: [span(material.pad, section, home)],
        counter: sequence(
          material.phrases,
          section,
          offset,
          shift(section.area, { invert: true }),
        ),
        lead: [motto(theme, section, 2, 4)],
        arp: arp ? [span(arp, section, home)] : [],
      }
    case 'outro':
      // The theme once more, then again at half speed as the bass drops out.
      return {
        pad: [span(material.pad, section, home)],
        bass: [part(material.bass, section.start, half, home)],
        lead: [
          part(theme, section.start, half, shift(0)),
          part(
            theme,
            section.start + half,
            section.length - half,
            shift(0, { stretch: 2 }),
          ),
        ],
      }
  }
}
