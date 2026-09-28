import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import * as Tone from 'tone'
import { voice, type Voice } from './instruments.ts'
import { defaults, num, type Sound } from './sound.ts'

/**
 * Plays one realised composition through Tone.js. Every note is scheduled on
 * Tone's transport up front, so seeking and pausing are the transport's job
 * and the scene only has to ask where the music is.
 */
export class Player {
  readonly #secondsPerBeat: number
  readonly #end: number
  readonly #channels = new Map<string, Tone.Channel>()
  readonly #voices = new Map<string, Voice>()
  /** Each track's current sound, so the panel can reopen where it left off. */
  readonly #sounds = new Map<string, Sound>()
  readonly #parts: Tone.Part[] = []
  readonly #reverb: Tone.Reverb
  readonly #onEnd: () => void

  /**
   * @param tracks the composition's notes, from `realise`
   * @param onEnd called when the piece plays to its last beat
   */
  constructor(
    composition: Composition,
    tracks: readonly RealisedTrack[],
    beats: number,
    onEnd: () => void,
  ) {
    this.#secondsPerBeat = 60 / composition.tempo
    this.#end = beats * this.#secondsPerBeat
    this.#onEnd = onEnd
    this.#reverb = new Tone.Reverb({ decay: 3.5, wet: 0.25 }).toDestination()

    const transport = Tone.getTransport()
    transport.cancel()
    transport.stop()
    transport.seconds = 0
    transport.bpm.value = composition.tempo

    for (const track of tracks) {
      const channel = new Tone.Channel().connect(this.#reverb)
      const sound = voice(track.role, channel)
      const part = new Tone.Part<{
        time: number
        note: RealisedTrack['notes'][number]
      }>(
        (time, { note }) =>
          sound.play(
            note.pitch,
            note.duration * this.#secondsPerBeat,
            time,
            note.velocity / 127,
          ),
        track.notes.map((note) => ({
          time: note.start * this.#secondsPerBeat,
          note,
        })),
      ).start(0)
      this.#channels.set(track.id, channel)
      this.#voices.set(track.id, sound)
      this.#sounds.set(track.id, defaults(track.role))
      this.#parts.push(part)
    }
    transport.scheduleOnce((time) => {
      // Tone calls back ahead of the audio clock; stop when the end is heard.
      Tone.getDraw().schedule(() => this.stop(), time)
    }, this.#end)
  }

  /** Starts or resumes. Browsers only allow audio after a click, so await it. */
  async play(): Promise<void> {
    await Tone.start()
    Tone.getTransport().start()
  }

  pause(): void {
    Tone.getTransport().pause()
    this.#silence()
  }

  /** Stops and rewinds to the first beat. */
  stop(): void {
    Tone.getTransport().stop()
    Tone.getTransport().seconds = 0
    this.#silence()
    this.#onEnd()
  }

  /** Moves to `beats` from the start, keeping playing if it was. */
  seek(beats: number): void {
    this.#silence()
    Tone.getTransport().seconds = Math.max(0, beats) * this.#secondsPerBeat
  }

  /**
   * Beats from the start that can be heard now. The transport runs ahead of
   * the speakers by the scheduling look-ahead, so ask for the audio clock's
   * present, not the transport's.
   */
  get beats(): number {
    const transport = Tone.getTransport()
    if (transport.state !== 'started')
      return transport.seconds / this.#secondsPerBeat
    return transport.getSecondsAtTime(Tone.immediate()) / this.#secondsPerBeat
  }

  get playing(): boolean {
    return Tone.getTransport().state === 'started'
  }

  /** Turns one track's sound off or back on, by id. */
  mute(track: string, muted: boolean): void {
    const channel = this.#channels.get(track)
    if (channel) channel.mute = muted
  }

  /** One track's current sound, by id. */
  sound(track: string): Sound {
    return this.#sounds.get(track) ?? {}
  }

  /** Changes one track's synth and channel settings, by id. */
  tune(track: string, sound: Sound): void {
    const channel = this.#channels.get(track)
    const synth = this.#voices.get(track)
    if (!channel || !synth) return
    this.#sounds.set(track, sound)
    channel.volume.value = num(sound, 'volume')
    channel.pan.value = num(sound, 'pan')
    synth.tune(sound)
  }

  dispose(): void {
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    for (const part of this.#parts) part.dispose()
    for (const sound of this.#voices.values()) sound.dispose()
    for (const channel of this.#channels.values()) channel.dispose()
    this.#reverb.dispose()
  }

  #silence(): void {
    for (const sound of this.#voices.values()) sound.silence()
  }
}
