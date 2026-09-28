import type { MusicalRole } from '@codedocs/codesong/browser'

/**
 * The settings a listener can change on each role's synth, with their
 * starting values. The instruments build their synths from these defaults and
 * the sound panel draws a control for each, so the two cannot drift apart.
 */

/** A number setting: a slider from `min` to `max`. */
export interface Knob {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
}

/** A pick from a short list, such as an oscillator's wave shape. */
export interface Choice {
  readonly value: string
  readonly options: readonly string[]
}

export type Setting = Knob | Choice

/** A role's settings, grouped as they appear in the panel. Keys are unique across groups. */
export type Settings = Readonly<
  Record<string, Readonly<Record<string, Setting>>>
>

/** One track's current values, by setting key. */
export type Sound = Readonly<Record<string, number | string>>

const knob = (value: number, min: number, max: number, step = 0.01): Knob => ({
  value,
  min,
  max,
  step,
})

const WAVES = [
  'sine',
  'triangle',
  'square',
  'sawtooth',
  'fatsine',
  'fattriangle',
  'fatsquare',
  'fatsawtooth',
]

/** Attack, decay, sustain and release, the shape of every note. */
const envelope = (a: number, d: number, s: number, r: number) => ({
  attack: knob(a, 0.001, 2, 0.001),
  decay: knob(d, 0.01, 2),
  sustain: knob(s, 0, 1),
  release: knob(r, 0.01, 4),
})

/** The channel every track has, whatever its synth. */
const MIX = {
  volume: knob(0, -40, 12, 0.5),
  pan: knob(0, -1, 1),
}

/** Each role's settings. The values match the sound the song was written for. */
export const SETTINGS: Readonly<Record<MusicalRole, Settings>> = {
  lead: {
    Oscillator: { wave: { value: 'fatsawtooth', options: WAVES } },
    Envelope: envelope(0.02, 0.2, 0.5, 0.4),
    Mix: MIX,
  },
  counter: {
    FM: {
      harmonicity: knob(2, 0.25, 8, 0.25),
      modulationIndex: knob(3, 0, 20, 0.1),
    },
    Envelope: envelope(0.01, 0.3, 0.3, 0.5),
    Mix: MIX,
  },
  bass: {
    Oscillator: { wave: { value: 'sawtooth', options: WAVES } },
    Filter: {
      cutoff: knob(120, 20, 2000, 1),
      octaves: knob(2.5, 0, 7, 0.1),
      resonance: knob(2, 0.1, 20, 0.1),
      filterAttack: knob(0.01, 0.001, 2, 0.001),
      filterDecay: knob(0.2, 0.01, 2),
      filterSustain: knob(0.3, 0, 1),
    },
    Envelope: envelope(0.01, 0.2, 0.7, 0.2),
    Mix: MIX,
  },
  pad: {
    AM: { harmonicity: knob(3, 0.25, 8, 0.25) },
    Envelope: envelope(0.6, 0.5, 0.8, 1.5),
    Mix: MIX,
  },
  arp: {
    Oscillator: { wave: { value: 'square', options: WAVES } },
    Envelope: envelope(0.005, 0.12, 0.1, 0.1),
    Mix: MIX,
  },
  percussion: {
    Kick: {
      kickPitch: knob(0.04, 0.001, 0.5, 0.001),
      kickDecay: knob(0.35, 0.05, 2),
    },
    Snare: { snareDecay: knob(0.16, 0.02, 1) },
    Hats: {
      closedDecay: knob(0.05, 0.01, 0.5),
      openDecay: knob(0.3, 0.05, 2),
      hatLevel: knob(-18, -40, 0, 0.5),
    },
    Mix: MIX,
  },
}

/** A role's starting values, flattened out of their groups. */
export function defaults(role: MusicalRole): Sound {
  const sound: Record<string, number | string> = {}
  for (const group of Object.values(SETTINGS[role]))
    for (const [key, setting] of Object.entries(group))
      sound[key] = setting.value
  return sound
}

/** A number setting's value, falling back to 0 if the key is not one. */
export const num = (sound: Sound, key: string): number => {
  const value = sound[key]
  return typeof value === 'number' ? value : 0
}
