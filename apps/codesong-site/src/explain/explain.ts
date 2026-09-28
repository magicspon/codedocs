import type {
  Composition,
  Evidence,
  FileMeasures,
  Motif,
  NoteEvent,
  Part,
  RegionEvidence,
  Section,
  Song,
} from '@codedocs/codesong/browser'
import {
  BUSY,
  GENRES,
  KNOTTED,
  NOTE_NAMES,
  TANGLED,
} from '@codedocs/codesong/browser'

/**
 * Why the piece is the way it is, in plain words. Each explanation restates
 * a rule from the composer (`apps/codesong/src/compose/`) with the numbers
 * this song fed it, so a listener can check the music against the code.
 */

const percent = (share: number): string => `${Math.round(share * 100)}%`
const decimal = (n: number): string => n.toFixed(1)

/** The key's name, such as "E♭ minor". */
export function keyName(composition: Composition): string {
  return `${NOTE_NAMES[composition.key]} ${composition.scale}`
}

/** How the code chose the key. */
export function keyReason({ composition, evidence }: Song): string {
  return (
    `On average each file uses ${decimal(evidence.meanFanOut)} other files. ` +
    `Multiplied by 1.5, that moves the key ${evidence.fifths} steps round the ` +
    `circle of fifths from C, to ${NOTE_NAMES[composition.key]}. ` +
    `Loosely connected code plays near C; tangled code plays in distant keys.`
  )
}

/**
 * How the code chose the genre, and what the listener is hearing if they
 * picked another.
 */
export function genreReason({ composition, evidence }: Song): string[] {
  const { genre, energy, tangle } = evidence.genre
  const busy = energy >= BUSY ? 'busy' : 'calm'
  const tangled =
    tangle >= KNOTTED ? 'knotted' : tangle >= TANGLED ? 'tangled' : 'orderly'
  const reason = [
    `Inside each part of the code, a file uses ${decimal(energy)} other ` +
      `files on average, so the code is ${busy} (busy from ${BUSY}). ` +
      `${percent(tangle)} of files sit in loops of files that depend on each ` +
      `other, so it is ${tangled} (tangled from ${percent(TANGLED)}, knotted ` +
      `from ${percent(KNOTTED)}).`,
    `Calm, orderly code suggests ambient; calm, tangled code lo-fi hip hop; ` +
      `busy, orderly code techno; busy, tangled code drum and bass. Knotted ` +
      `code, busy or calm, suggests jazz. This code suggests ` +
      `${GENRES[genre].label.toLowerCase()}.`,
  ]
  if (composition.genre !== genre) {
    reason.push(
      `You are hearing it as ${GENRES[composition.genre].label.toLowerCase()} ` +
        `instead. The notes still come from the same code; only the tempo, ` +
        `scale, section lengths, drums, bass and chord rhythms and sounds change.`,
    )
  }
  return reason
}

/** Harmonic areas by scale-degree shift, as a musician would name them. */
const AREA: Readonly<Record<number, string>> = {
  0: 'the home chord',
  3: 'the fourth (IV)',
  4: 'the fifth (V)',
  5: 'the sixth (vi)',
}

/** The subsystem a section was built from. */
export function regionOf(
  evidence: Evidence,
  section: Section,
): RegionEvidence | undefined {
  return evidence.regions.find((r) => r.path === section.source)
}

/** Why a section has its place, its role and its harmony. */
export function sectionReason(evidence: Evidence, section: Section): string[] {
  const region = regionOf(evidence, section)
  if (!region) return []
  const role = {
    intro: `It opens the song with ${region.name}, the part of the code that the rest depends on most.`,
    outro: `It closes the song by returning to ${region.name}, where the song began.`,
    chorus: `${region.name} is the chorus because it is the largest part of the code: ${percent(region.share)} of the files.`,
    breakdown: `${region.name} is the breakdown because its files are the most loosely linked to each other.`,
    verse: `${region.name} is a verse. Parts that other code depends on play earlier in the song.`,
  }[section.form]
  return [
    role,
    `${percent(region.foundation)} of the links that cross its border come in from other code, rather than going out.`,
    `Its harmony moves to ${AREA[section.area] ?? `a shift of ${section.area}`}. The more a part depends on other code, the further from home it moves.`,
    `It plays at ${percent(section.intensity)} intensity, which decides how many tracks join in.`,
  ]
}

/** The kind of material a motif is, from the prefix of its id. */
export function motifKind(motif: Motif): string {
  return motif.id.split(':')[0]!
}

/** What one kind of motif is made from. */
export function motifReason(motif: Motif): string {
  const kind = motifKind(motif)
  switch (kind) {
    case 'theme':
      return 'The theme: the longest chain of files in the whole project, where each file uses the next. It returns, changed, in every section.'
    case 'phrase':
      return 'A melody from a chain of files in this part of the code, where each file uses the next. One note for each file.'
    case 'pad': {
      const chords =
        motif.source.structure === 'clusters'
          ? 'Chords. Each chord comes from a group of files that work closely together, voiced by the group’s most central file.'
          : 'Chords from this part’s most central files, because it has too few groups of files to read chords from.'
      // The answer is the second pass over the same files.
      return motif.id.includes(':answer')
        ? `${chords} This is the answer: the same files again, with the later chords taking a different turn.`
        : chords
    }
    case 'bass':
      return 'The bass line follows the roots of the chords, which come from the same groups of files.'
    case 'arp':
      return 'An arpeggio from files that depend on each other in a loop. A loop in the code becomes a looping figure.'
    case 'groove':
      return 'The drum pattern. Busier code gives busier hi-hats. The files named are the ones that depend on no other file.'
    case 'fill':
      return 'A drum fill leading into the next section, from the same files as the groove.'
    default:
      return `Made from ${motif.source.structure.replace('-', ' ')}.`
  }
}

/**
 * The part that played `note`: the placement on its track whose span holds
 * the note's start. Parts on one track do not overlap for the same motif.
 */
export function partOf(
  parts: readonly Part[],
  note: NoteEvent,
): Part | undefined {
  return parts.find(
    (p) =>
      p.motif === note.motif &&
      note.start >= p.start - 1e-9 &&
      note.start < p.start + p.length,
  )
}

/** Which note of its motif `note` is, undoing the part's loop and stretch. */
export function noteIndex(motif: Motif, part: Part, note: NoteEvent): number {
  const stretch = part.transform.stretch
  const loop = motif.length * stretch
  const offset = ((note.start - part.start) % loop) / stretch
  return motif.notes.findIndex((n) => Math.abs(n.start - offset) < 1e-6)
}

/**
 * The file one note stands for. Melodies read one file per note, an
 * arpeggio cycles through its loop, and chords and bass change file once a
 * bar, one chord per file. Drums name files but not one per hit.
 */
export function fileOf(motif: Motif, index: number): string | undefined {
  const files = motif.source.files
  const note = motif.notes[index]
  if (note === undefined || files.length === 0) return undefined
  switch (motifKind(motif)) {
    case 'theme':
    case 'phrase':
      return files[index]
    case 'arp':
      return files[index % files.length]
    case 'pad':
    case 'bass':
      return files[Math.floor(note.start / 4) % files.length]
    default:
      return undefined
  }
}

/** Why a melody or arpeggio note is the pitch, length and loudness it is. */
export function noteReason(
  motif: Motif,
  index: number,
  file: FileMeasures,
): string[] {
  const kind = motifKind(motif)
  if (kind === 'arp') {
    return [
      `How deep the file sits (deeper than ${percent(file.rank.depth)} of files) picks which note of the chord it plays.`,
    ]
  }
  if (kind !== 'theme' && kind !== 'phrase') return []
  return [
    index === 0
      ? `It starts the melody. How deep the file sits (deeper than ${percent(file.rank.depth)} of files) picks the first note.`
      : `${file.fanIn} files use this one (more than ${percent(file.rank.fanIn)} of files), which picks the step from the note before. Files used by many step up.`,
    `It uses ${file.fanOut} ${file.fanOut === 1 ? 'file' : 'files'} (more than ${percent(file.rank.fanOut)} of files). Files that use more play shorter notes.`,
    `How central it is (more than ${percent(file.rank.centrality)} of files) sets how loud it plays.`,
  ]
}

/** A played note traced back to the part that placed it and its file. */
export interface Trace {
  readonly note: NoteEvent
  readonly part?: Part
  /** Which of the motif's notes it is; -1 when no part holds it. */
  readonly index: number
  readonly file?: string
}

/** Traces `note`, played from `motif` on a track with `parts`. */
export function trace(
  motif: Motif,
  parts: readonly Part[],
  note: NoteEvent,
): Trace {
  const part = partOf(parts, note)
  const index = part ? noteIndex(motif, part, note) : -1
  return { note, part, index, file: fileOf(motif, index) }
}

/** How a part changed its motif, or nothing when it plays it as written. */
export function transformReason(part: Part): string | undefined {
  const t = part.transform
  const changes = [
    t.transpose !== 0 && `moved ${t.transpose} scale steps`,
    t.invert && 'turned upside down',
    t.octave !== 0 &&
      `${Math.abs(t.octave)} octave${Math.abs(t.octave) > 1 ? 's' : ''} ${t.octave > 0 ? 'higher' : 'lower'}`,
    t.stretch !== 1 &&
      (t.stretch > 1
        ? `${t.stretch} times slower`
        : `${1 / t.stretch} times faster`),
    t.fragment !== undefined && `only its first ${t.fragment} notes`,
  ].filter((c): c is string => typeof c === 'string')
  return changes.length === 0 ? undefined : `Here it is ${changes.join(', ')}.`
}
