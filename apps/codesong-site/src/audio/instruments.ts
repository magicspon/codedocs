import type { MusicalRole } from '@codedocs/codesong/browser'
import { DRUM_NOTES } from '@codedocs/codesong/browser'
import * as Tone from 'tone'
import { defaults, num, type Sound } from './sound.ts'

/**
 * A sound for each role, built from Tone.js synths. The Live build uses
 * Ableton's instruments; these stand in for them, close enough to hear how
 * the parts fit together.
 */

/** One role's sound. */
export interface Voice {
  /** Plays a MIDI note at `time` (seconds, audio clock) for `seconds`. */
  play(pitch: number, seconds: number, time: number, velocity: number): void
  /** Changes the synth's settings; the next note plays with them. */
  tune(sound: Sound): void
  /** Stops anything still ringing, as when the player seeks. */
  silence(): void
  dispose(): void
}

const hz = (pitch: number): number =>
  Tone.Frequency(pitch, 'midi').toFrequency()

const envelope = (s: Sound) => ({
  attack: num(s, 'attack'),
  decay: num(s, 'decay'),
  sustain: num(s, 'sustain'),
  release: num(s, 'release'),
})

// Sound values are loose strings; the panel only offers Tone's wave names.
const wave = (s: Sound) => ({ type: s.wave as 'sine' })

/** A polyphonic synth as a voice; most roles are one of these. */
function poly<
  V extends Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.MonoSynth,
>(
  synth: Tone.PolySynth<V>,
  out: Tone.ToneAudioNode,
  options: (sound: Sound) => Parameters<Tone.PolySynth<V>['set']>[0],
): Voice {
  synth.connect(out)
  return {
    play: (pitch, seconds, time, velocity) =>
      synth.triggerAttackRelease(hz(pitch), seconds, time, velocity),
    tune: (sound) => synth.set(options(sound)),
    silence: () => synth.releaseAll(),
    dispose: () => synth.dispose(),
  }
}

/**
 * A 909-ish kit. Realised percussion notes are General MIDI drum numbers,
 * so the pitch picks the drum.
 */
function drums(out: Tone.ToneAudioNode): Voice {
  const kick = new Tone.MembraneSynth({ octaves: 6 }).connect(out)
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' } }).connect(out)
  const hat = (): Tone.MetalSynth =>
    new Tone.MetalSynth({
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(out)
  const closed = hat()
  const open = hat()
  const [KICK, SNARE, HAT] = DRUM_NOTES
  const kit: Voice = {
    play(pitch, seconds, time, velocity) {
      if (pitch === KICK)
        kick.triggerAttackRelease('C1', seconds, time, velocity)
      else if (pitch === SNARE)
        snare.triggerAttackRelease(seconds, time, velocity)
      else if (pitch === HAT)
        closed.triggerAttackRelease(300, seconds, time, velocity)
      else open.triggerAttackRelease(300, seconds, time, velocity)
    },
    tune(s) {
      kick.set({
        pitchDecay: num(s, 'kickPitch'),
        envelope: { attack: 0.001, decay: num(s, 'kickDecay'), sustain: 0 },
      })
      snare.set({
        envelope: { attack: 0.001, decay: num(s, 'snareDecay'), sustain: 0 },
      })
      closed.set({ envelope: { attack: 0.001, decay: num(s, 'closedDecay') } })
      open.set({ envelope: { attack: 0.001, decay: num(s, 'openDecay') } })
      for (const h of [closed, open]) h.volume.value = num(s, 'hatLevel')
    },
    silence() {
      // One-shot drums end on their own; nothing rings long enough to cut.
    },
    dispose() {
      for (const synth of [kick, snare, closed, open]) synth.dispose()
    },
  }
  return kit
}

/** The role's synth, before any sound is set. Volumes balance the parts against each other. */
function build(role: MusicalRole, out: Tone.ToneAudioNode): Voice {
  switch (role) {
    case 'lead':
      return poly(
        new Tone.PolySynth(Tone.Synth, { volume: -14 }),
        out,
        (s) => ({
          oscillator: { ...wave(s), count: 2, spread: 18 },
          envelope: envelope(s),
        }),
      )
    case 'counter':
      return poly(
        new Tone.PolySynth(Tone.FMSynth, { volume: -16 }),
        out,
        (s) => ({
          harmonicity: num(s, 'harmonicity'),
          modulationIndex: num(s, 'modulationIndex'),
          envelope: envelope(s),
        }),
      )
    case 'bass':
      return poly(
        new Tone.PolySynth(Tone.MonoSynth, { volume: -12 }),
        out,
        (s) => ({
          oscillator: wave(s),
          filter: { Q: num(s, 'resonance'), type: 'lowpass' as const },
          filterEnvelope: {
            attack: num(s, 'filterAttack'),
            decay: num(s, 'filterDecay'),
            sustain: num(s, 'filterSustain'),
            baseFrequency: num(s, 'cutoff'),
            octaves: num(s, 'octaves'),
          },
          envelope: envelope(s),
        }),
      )
    case 'pad':
      return poly(
        new Tone.PolySynth(Tone.AMSynth, { volume: -20 }),
        out,
        (s) => ({
          harmonicity: num(s, 'harmonicity'),
          envelope: envelope(s),
        }),
      )
    case 'arp':
      return poly(
        new Tone.PolySynth(Tone.Synth, { volume: -22 }),
        out,
        (s) => ({
          oscillator: wave(s),
          envelope: envelope(s),
        }),
      )
    case 'percussion':
      return drums(out)
  }
}

/** Builds the voice for `role` at its default sound, playing into `out`. */
export function voice(role: MusicalRole, out: Tone.ToneAudioNode): Voice {
  const sound = build(role, out)
  sound.tune(defaults(role))
  return sound
}
