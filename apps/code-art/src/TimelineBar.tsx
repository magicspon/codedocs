import { useEffect, useState, type JSX } from 'react'
import type { Playhead, Series } from './lib/series.ts'

/** Frames per second of history: a 16-commit timeline plays in about ten seconds. */
const SPEED = 1.6

interface TimelineBarProps {
  readonly series: Series
  readonly playhead: Playhead
  /** Called when the whole frame under the playhead changes. */
  readonly onFrame: (frame: number) => void
}

/**
 * Play, pause and scrub through a timeline. It owns the animation loop and
 * writes `playhead.t` directly, so the scenes follow it without React
 * re-rendering the canvas sixty times a second.
 */
export function TimelineBar({
  series,
  playhead,
  onFrame,
}: TimelineBarProps): JSX.Element {
  const last = series.commits.length - 1
  const [t, setT] = useState(playhead.t)
  // A history is for watching grow: start playing as soon as it loads.
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let id = requestAnimationFrame(function step(now) {
      playhead.t = Math.min(
        last,
        playhead.t + ((now - previous) / 1000) * SPEED,
      )
      previous = now
      setT(playhead.t)
      if (playhead.t >= last) setPlaying(false)
      else id = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(id)
  }, [playing, playhead, last])

  const frame = Math.round(t)
  useEffect(() => onFrame(frame), [frame, onFrame])

  const toggle = (): void => {
    // Play at the end means play again from the start.
    if (!playing && playhead.t >= last) playhead.t = 0
    setPlaying(!playing)
  }
  const scrub = (value: number): void => {
    setPlaying(false)
    playhead.t = value
    setT(value)
  }

  const commit = series.commits[frame]
  return (
    <div className="panel timeline">
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={0.01}
        value={t}
        onChange={(e) => scrub(Number(e.target.value))}
        aria-label="Commit"
      />
      <p className="commit">
        <span className="meta">
          {frame + 1}/{last + 1} · {commit?.sha.slice(0, 7)} ·{' '}
          {commit?.date.slice(0, 10)}
        </span>
        <span>{commit?.subject}</span>
      </p>
    </div>
  )
}
