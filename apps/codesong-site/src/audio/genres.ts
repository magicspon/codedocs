import type { GenreName, MusicalRole } from '@codedocs/codesong/browser'
import type { Sound } from './sound.ts'

/**
 * How each genre sounds in the browser: changes to the roles' synth settings
 * and the room they play in. The composer decides what each genre plays;
 * this decides only what it sounds like, so it stays with the site.
 */
export interface GenreSound {
  /** Reverb over every track: seconds of tail and how much of it is heard. */
  readonly reverb: { readonly decay: number; readonly wet: number }
  /** A low-pass over the whole mix, in hertz: lower sounds more muffled. */
  readonly tone: number
  /** Settings that differ from each role's defaults in `sound.ts`. */
  readonly sounds: Partial<Record<MusicalRole, Sound>>
}

/** Every sound, by genre. Keys are setting keys from `sound.ts`. */
export const GENRE_SOUND: Readonly<Record<GenreName, GenreSound>> = {
  ambient: {
    reverb: { decay: 8, wet: 0.5 },
    tone: 12000,
    sounds: {
      lead: { wave: 'sine', attack: 0.3, sustain: 0.7, release: 2 },
      counter: { modulationIndex: 1, attack: 0.2, release: 1.5 },
      bass: { wave: 'sine', cutoff: 200, attack: 0.2, release: 1 },
      pad: { attack: 1.5, release: 3 },
      arp: { wave: 'triangle', release: 0.8 },
      percussion: { hatLevel: -26, closedDecay: 0.08 },
    },
  },
  lofi: {
    reverb: { decay: 2.5, wet: 0.2 },
    // Muffled, like a worn tape.
    tone: 2800,
    sounds: {
      lead: { wave: 'triangle', decay: 0.4, sustain: 0.3, release: 0.6 },
      // A soft FM bell, close to an electric piano.
      counter: {
        harmonicity: 1,
        modulationIndex: 1.5,
        attack: 0.005,
        decay: 0.8,
        sustain: 0.2,
        release: 0.8,
      },
      bass: { wave: 'triangle', cutoff: 300 },
      pad: { harmonicity: 1 },
      percussion: { kickDecay: 0.5, snareDecay: 0.22, hatLevel: -22 },
    },
  },
  techno: {
    reverb: { decay: 1.8, wet: 0.15 },
    tone: 20000,
    sounds: {
      lead: {
        wave: 'square',
        attack: 0.005,
        decay: 0.15,
        sustain: 0.2,
        release: 0.1,
      },
      bass: {
        wave: 'sawtooth',
        cutoff: 90,
        resonance: 8,
        octaves: 3.5,
        filterDecay: 0.12,
        filterSustain: 0.1,
      },
      arp: { wave: 'sawtooth' },
      percussion: {
        kickPitch: 0.05,
        kickDecay: 0.45,
        closedDecay: 0.03,
        openDecay: 0.18,
        hatLevel: -16,
      },
    },
  },
  dnb: {
    reverb: { decay: 2.5, wet: 0.2 },
    tone: 20000,
    sounds: {
      lead: { wave: 'fatsawtooth', attack: 0.05, release: 0.8 },
      // A clean sine sub, felt more than heard.
      bass: { wave: 'sine', cutoff: 400, resonance: 1, octaves: 1 },
      percussion: {
        kickPitch: 0.02,
        kickDecay: 0.25,
        snareDecay: 0.12,
        closedDecay: 0.03,
        hatLevel: -20,
      },
    },
  },
}
