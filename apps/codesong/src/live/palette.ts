/**
 * What each role sounds like in Live. Shaped like a style so that `--style
 * ambient` or `--style techno` later is a second table, not new code.
 *
 * The SDK only loads Live's own devices with their default presets, so a
 * sound here is a device name plus the effects after it.
 */

import type { MusicalRole } from '../model.ts'

/** One role's device chain, instrument first. */
export interface Voice {
  /** A built-in Live instrument, by the name Live's browser shows. */
  readonly instrument: string
  /** Built-in audio effects, in chain order. */
  readonly effects: readonly string[]
  /** Clip colour as a hex RGB number, so a role reads at a glance in the arrangement. */
  readonly color: number
}

/** Where one drum voice's sample comes from in Live's Core Library. */
export interface DrumSample {
  /** Folder under `Samples/One Shots/Drums`. */
  readonly folder: string
  /** The preferred file in that folder. */
  readonly file: string
  /** Used when `file` is missing: the first file whose name starts with this. */
  readonly prefix: string
}

/** A complete sound palette. */
export interface Palette {
  readonly name: string
  readonly voices: Readonly<Record<MusicalRole, Voice>>
  /** One sample per drum voice, keyed like `DRUM_VOICES`. */
  readonly kit: Readonly<Record<string, DrumSample>>
}

/** The only palette for now: warm synths over a 909 kit. */
export const DEFAULT_PALETTE: Palette = {
  name: 'default',
  voices: {
    lead: {
      instrument: 'Drift',
      effects: ['Delay', 'Reverb'],
      color: 0xff6b5a,
    },
    counter: {
      instrument: 'Electric',
      effects: ['Chorus-Ensemble', 'Reverb'],
      color: 0xffb347,
    },
    bass: { instrument: 'Operator', effects: ['Saturator'], color: 0x4f7cff },
    pad: { instrument: 'Wavetable', effects: ['Reverb'], color: 0x9b6bff },
    arp: { instrument: 'Analog', effects: ['Delay'], color: 0x3ccf91 },
    percussion: {
      instrument: 'Drum Rack',
      effects: ['Glue Compressor'],
      color: 0xb0b0b0,
    },
  },
  kit: {
    kick: { folder: 'Kick', file: 'Kick 909 1.aif', prefix: 'Kick' },
    snare: { folder: 'Snare', file: 'Snare 909 Hard 1.wav', prefix: 'Snare' },
    'closed-hat': {
      folder: 'Hihat',
      file: 'Hihat Closed 909.aif',
      prefix: 'Hihat Closed',
    },
    'open-hat': {
      folder: 'Hihat',
      file: 'Hihat Open 909.aif',
      prefix: 'Hihat Open',
    },
  },
}
