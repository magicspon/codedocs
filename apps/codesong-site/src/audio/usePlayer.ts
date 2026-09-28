import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { useCallback, useEffect, useState } from 'react'
import { Player } from './player.ts'
import type { Sound } from './sound.ts'

/** The player as the page sees it: state to render, and actions to call. */
export interface PlayerControls {
  readonly playing: boolean
  readonly muted: ReadonlySet<string>
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

/**
 * One Tone.js player for one song. Moving to another song disposes the old
 * player's synths before the new one's are built.
 */
export function usePlayer(
  composition: Composition,
  tracks: readonly RealisedTrack[],
  length: number,
): PlayerControls {
  const [player, setPlayer] = useState<Player>()
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const p = new Player(composition, tracks, length, () => setPlaying(false))
    setPlayer(p)
    setPlaying(false)
    setMuted(new Set())
    return () => p.dispose()
  }, [composition, tracks, length])

  const beats = useCallback(() => player?.beats ?? 0, [player])

  const toggle = useCallback(() => {
    if (!player) return
    if (player.playing) {
      player.pause()
      setPlaying(false)
    } else {
      // Browsers start audio only after a click, so this waits for Tone.
      void player.play().then(() => setPlaying(player.playing))
    }
  }, [player])

  const seek = useCallback((at: number) => player?.seek(at), [player])

  const mute = useCallback(
    (track: string) => {
      const next = new Set(muted)
      if (next.has(track)) next.delete(track)
      else next.add(track)
      player?.mute(track, next.has(track))
      setMuted(next)
    },
    [player, muted],
  )

  const sound = useCallback(
    (track: string) => player?.sound(track) ?? {},
    [player],
  )
  const tune = useCallback(
    (track: string, next: Sound) => player?.tune(track, next),
    [player],
  )

  return { playing, muted, beats, toggle, seek, mute, sound, tune }
}
