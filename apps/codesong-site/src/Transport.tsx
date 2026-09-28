import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { ROLE_COLOUR } from './scene/layout.ts'

interface Props {
  /** Buttons before the play button, such as home and info. */
  readonly corner?: ReactNode
  readonly title: string
  /** Controls after the title, such as the genre picker. */
  readonly beside?: ReactNode
  readonly composition: Composition
  readonly tracks: readonly RealisedTrack[]
  readonly length: number
  readonly playing: boolean
  readonly muted: ReadonlySet<string>
  readonly follow: boolean
  readonly beats: () => number
  readonly onToggle: () => void
  readonly onSeek: (beats: number) => void
  readonly onMute: (track: string) => void
  /** The track whose sound settings are open, if any. */
  readonly selected: string | undefined
  /** Opens a track's sound settings, or closes them if they are open. */
  readonly onSelect: (track: string) => void
  readonly onFollow: (follow: boolean) => void
}

interface ChipProps {
  readonly track: RealisedTrack
  readonly muted: boolean
  readonly selected: boolean
  readonly onSelect: (track: string) => void
  readonly onMute: (track: string) => void
}

/** One track: its name opens its sound settings, the speaker mutes it. */
function TrackChip({
  track,
  muted,
  selected,
  onSelect,
  onMute,
}: ChipProps): JSX.Element {
  const label = muted ? `Turn ${track.name} on` : `Mute ${track.name}`
  return (
    <span
      className="track"
      data-muted={muted}
      style={{ ['--role' as string]: ROLE_COLOUR[track.role] }}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(track.id)}
        title={`Change how ${track.name} sounds`}
      >
        {track.name}
      </button>
      <button
        type="button"
        className="mute"
        aria-pressed={muted}
        onClick={() => onMute(track.id)}
        aria-label={label}
        title={label}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </span>
  )
}

/** `m:ss` for a number of seconds. */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/**
 * The controls over the scene: play, a position slider, the time, and per
 * track a button to open its sound settings and one to mute it. The time and slider move every frame, so they
 * are written directly rather than through React state.
 */
export function Transport(props: Props): JSX.Element {
  const { composition, length, beats, onToggle } = props
  const time = useRef<HTMLSpanElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    let frame = 0
    const tick = (): void => {
      const now = Math.min(beats(), length)
      const bar = Math.floor(now / composition.beatsPerBar) + 1
      const seconds = (now * 60) / composition.tempo
      if (time.current) {
        time.current.textContent = `bar ${bar} · ${clock(seconds)} / ${clock((length * 60) / composition.tempo)}`
      }
      if (slider.current && !dragging.current)
        slider.current.value = String(now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [beats, length, composition])

  // Space plays and pauses, unless a control that uses space has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (e.code !== 'Space' || target.closest('button, input, select, a'))
        return
      e.preventDefault()
      onToggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onToggle])

  return (
    <div className="transport">
      <div className="transport-row">
        {props.corner}
        <button
          type="button"
          className="play"
          onClick={onToggle}
          aria-label={props.playing ? 'Pause' : 'Play'}
        >
          {props.playing ? '❚❚' : '▶'}
        </button>
        <h1>{props.title}</h1>
        {props.beside}
        <span ref={time} className="time" aria-live="off" />
      </div>
      <input
        ref={slider}
        type="range"
        className="scrub"
        aria-label="Position in the song"
        min={0}
        max={length}
        step={composition.beatsPerBar}
        defaultValue={0}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onChange={(e) => props.onSeek(Number(e.target.value))}
      />
      <div className="transport-row">
        {props.tracks.map((track) => (
          <TrackChip
            key={track.id}
            track={track}
            muted={props.muted.has(track.id)}
            selected={props.selected === track.id}
            onSelect={props.onSelect}
            onMute={props.onMute}
          />
        ))}
        <label className="follow">
          <input
            type="checkbox"
            checked={props.follow}
            onChange={(e) => props.onFollow(e.target.checked)}
          />
          Follow the music
        </label>
      </div>
    </div>
  )
}
