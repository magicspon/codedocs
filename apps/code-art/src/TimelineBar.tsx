import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Playhead, Series } from './lib/series.ts'
import { unwarp, warp } from './lib/time-warp.ts'

/** Frames per second of history: a 16-commit timeline plays in about ten seconds. */
const SPEED = 1.6

interface TimelineBarProps {
  readonly series: Series
  readonly playhead: Playhead
  /** Called when the whole frame under the playhead changes. */
  readonly onFrame: (frame: number) => void
  /** The only frames to play, from `keyFrames`, when isolation squeezes time; `null` plays them all. */
  readonly keys: readonly number[] | null
  /** Out of sight but still playing, so the scene keeps growing behind it. */
  readonly hidden?: boolean
}

/**
 * Play, pause and scrub through a timeline. It owns the animation loop and
 * writes `playhead.t` directly, so the scenes follow it without React
 * re-rendering the canvas sixty times a second. Under isolation it plays
 * only `keys`, one step each, and the slider spans those steps.
 */
export function TimelineBar({
  series,
  playhead,
  onFrame,
  keys: squeezed,
  hidden = false,
}: TimelineBarProps): JSX.Element {
  const frames = series.commits.length
  const keys = useMemo(
    () => squeezed ?? Array.from({ length: frames }, (_, f) => f),
    [squeezed, frames],
  )
  const last = keys.length - 1
  // Where the slider sits, in steps along `keys`; the playhead is its frame.
  const [step, setStep] = useState(() => unwarp(keys, playhead.t))
  // A history is for watching grow: start playing as soon as it loads.
  const [playing, setPlaying] = useState(true)

  // New keys: find the playhead on them, and snap it to a frame they play.
  useEffect(() => {
    const at = unwarp(keys, playhead.t)
    playhead.t = warp(keys, at)
    setStep(at)
  }, [keys, playhead])

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let at = unwarp(keys, playhead.t)
    let id = requestAnimationFrame(function tick(now) {
      at = Math.min(last, at + ((now - previous) / 1000) * SPEED)
      previous = now
      playhead.t = warp(keys, at)
      setStep(at)
      if (at >= last) setPlaying(false)
      else id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [playing, playhead, keys, last])

  const frame = Math.round(warp(keys, step))
  useEffect(() => onFrame(frame), [frame, onFrame])

  const toggle = (): void => {
    // Play at the end means play again from the start.
    if (!playing && step >= last) {
      playhead.t = warp(keys, 0)
      setStep(0)
    }
    setPlaying(!playing)
  }
  const scrub = (value: number): void => {
    setPlaying(false)
    playhead.t = warp(keys, value)
    setStep(value)
  }

  const commit = series.commits[frame]
  return (
    <div className="panel timeline" hidden={hidden}>
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={0.01}
        value={step}
        onChange={(e) => scrub(Number(e.target.value))}
        aria-label="Commit"
      />
      <p className="commit">
        <span className="commit-meta">
          {squeezed
            ? `step ${Math.round(step) + 1}/${last + 1} · `
            : `${frame + 1}/${frames} · `}
          {commit?.sha.slice(0, 7)} · {commit?.date.slice(0, 10)}
        </span>
        <span>{commit?.subject}</span>
      </p>
    </div>
  )
}
