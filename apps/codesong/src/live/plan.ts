/**
 * The composition as a Live Set to build: tracks with their device chains,
 * one MIDI clip per section, markers and drum pads. Plain JSON, so the compose
 * script writes it and the extension inside Live only has to follow it.
 */

import { DRUM_VOICES, type Composition, type MusicalRole } from '../model.ts'
import { DRUM_NOTES, type RealisedTrack } from '../render/realise.ts'
import type { Palette } from './palette.ts'

/** Bumped when the extension can no longer read an older plan. */
const PLAN_VERSION = 1

/** A note as Live takes it: times in beats from the clip's start. */
export interface LiveNote {
  readonly pitch: number
  readonly startTime: number
  readonly duration: number
  readonly velocity: number
}

/** One arrangement clip. */
export interface LiveClip {
  readonly name: string
  /** Beats from the start of the arrangement. */
  readonly start: number
  readonly length: number
  readonly color: number
  readonly notes: readonly LiveNote[]
}

/** One Drum Rack pad. */
export interface DrumPad {
  readonly voice: string
  /** The MIDI note that plays the pad. */
  readonly note: number
  /** Absolute path in Live's library; absent leaves the pad empty. */
  readonly sample?: string
}

export interface LiveTrackPlan {
  readonly name: string
  readonly role: MusicalRole
  readonly instrument: string
  readonly effects: readonly string[]
  /** Only on the percussion track, whose instrument is a Drum Rack. */
  readonly pads?: readonly DrumPad[]
  readonly clips: readonly LiveClip[]
}

/** Everything the extension needs, with nothing left to decide. */
export interface LivePlan {
  readonly version: number
  /** The repository, shown to the person building it. */
  readonly name: string
  readonly commit: string
  readonly composerVersion: string
  readonly palette: string
  readonly tempo: number
  readonly markers: readonly { readonly time: number; readonly name: string }[]
  readonly tracks: readonly LiveTrackPlan[]
}

const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The notes that start inside `[start, end)`, moved to the clip's time and
 * cut at its end. A note ringing over a section boundary is cut, as the
 * composer already cuts notes at the end of a part.
 */
function clipNotes(
  track: RealisedTrack,
  start: number,
  end: number,
): LiveNote[] {
  return track.notes
    .filter((n) => n.start >= start && n.start < end)
    .map((n) => ({
      pitch: n.pitch,
      startTime: n.start - start,
      duration: Math.min(n.duration, end - n.start),
      velocity: n.velocity,
    }))
}

/**
 * Plans `composition` for Live. `kit` maps drum voices to sample paths, as
 * `findKit` returns them.
 */
export function livePlan(
  composition: Composition,
  tracks: readonly RealisedTrack[],
  palette: Palette,
  kit: Readonly<Record<string, string>>,
): LivePlan {
  return {
    version: PLAN_VERSION,
    name: composition.origin.repository,
    commit: composition.origin.commit,
    composerVersion: composition.composerVersion,
    palette: palette.name,
    tempo: composition.tempo,
    markers: composition.sections.map((s) => ({
      time: s.start,
      name: s.name,
    })),
    tracks: tracks.map((track): LiveTrackPlan => {
      const voice = palette.voices[track.role]
      const clips = composition.sections.flatMap((s): LiveClip[] => {
        const notes = clipNotes(track, s.start, s.start + s.length)
        if (notes.length === 0) return []
        const name = `${s.name} (${s.form})`
        return [
          { name, start: s.start, length: s.length, color: voice.color, notes },
        ]
      })
      const pads =
        track.role === 'percussion'
          ? DRUM_VOICES.map((v, i): DrumPad => {
              const sample = kit[v]
              const note = DRUM_NOTES[i]!
              return sample === undefined
                ? { voice: v, note }
                : { voice: v, note, sample }
            })
          : undefined
      return {
        name: title(track.name),
        role: track.role,
        instrument: voice.instrument,
        effects: voice.effects,
        ...(pads && { pads }),
        clips,
      }
    }),
  }
}

/**
 * Reads a plan the compose script wrote. Throws on a plan from a different
 * version rather than building half of it.
 */
export function parsePlan(json: string): LivePlan {
  const plan = JSON.parse(json) as Partial<LivePlan>
  if (plan.version !== PLAN_VERSION || !Array.isArray(plan.tracks)) {
    throw new Error(
      `not a CodeSong plan this version can build (want version ${PLAN_VERSION}, got ${String(plan.version)}); compose it again`,
    )
  }
  return plan as LivePlan
}
