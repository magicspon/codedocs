import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { useEffect, useRef, useState } from 'react'
import { takeOver, type Handover } from './handover.ts'
import { Player } from './player.ts'
import type { Sound } from './sound.ts'

/** What the page can ask of the player. */
interface Actions {
  /** Where the music is, in beats. Cheap enough to call every frame. */
  readonly beats: () => number
  readonly toggle: () => void
  readonly seek: (beats: number) => void
  /** Turns one track off, or back on. */
  readonly mute: (track: string) => void
  /** One track's current synth settings. */
  readonly sound: (track: string) => Sound
  /** Changes one track's synth settings. */
  readonly tune: (track: string, sound: Sound) => void
}

/** The player as the page sees it: state to render, and actions to call. */
export interface PlayerControls extends Actions {
  readonly playing: boolean
  readonly muted: ReadonlySet<string>
}

/** What the page can call before the first player is built: nothing happens. */
const IDLE: Actions = {
  beats: () => 0,
  toggle: () => {},
  seek: () => {},
  mute: () => {},
  sound: () => ({}),
  tune: () => {},
}

/**
 * One Tone.js player for one song. Moving to another composition disposes
 * the old player's synths before the new one's are built. The actions are
 * made with the player, so none can reach a player that has been disposed.
 *
 * Every genre of a song has the same sections, so a new composition in the
 * same hook (a genre switch) carries on from the same place in the same
 * section, with the same tracks muted. Key the hook's component by
 * song so a new song starts over.
 */
export function usePlayer(
  composition: Composition,
  tracks: readonly RealisedTrack[],
  length: number,
): PlayerControls {
  const [actions, setActions] = useState<Actions>(IDLE)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set())
  const handover = useRef<Handover | null>(null)

  useEffect(() => {
    const p = new Player(composition, tracks, length, () => setPlaying(false))
    setPlaying(false)
    // Held beside the player, so muting never reads a stale render's set.
    const off = takeOver(p, handover.current, composition.sections, setPlaying)
    setMuted(new Set(off))
    setActions({
      beats: () => p.beats,
      toggle: () => {
        if (p.playing) {
          p.pause()
          setPlaying(false)
        } else {
          // Browsers start audio only after a click, so this waits for Tone.
          void p.play().then(() => setPlaying(p.playing))
        }
      },
      seek: (at) => p.seek(at),
      mute: (track) => {
        if (off.has(track)) off.delete(track)
        else off.add(track)
        p.mute(track, off.has(track))
        setMuted(new Set(off))
      },
      sound: (track) => p.sound(track),
      tune: (track, sound) => p.tune(track, sound),
    })
    return () => {
      handover.current = {
        beats: p.beats,
        sections: composition.sections,
        playing: p.playing,
        muted: off,
      }
      p.dispose()
    }
  }, [composition, tracks, length])

  return { ...actions, playing, muted }
}
