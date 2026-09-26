import type { JSX, MouseEvent } from 'react'
import type { Via } from './lib/trace.ts'
import { CallsIcon, ImportsIcon } from './icons.tsx'

/** Each kind of link, its icon and what its button says. */
const CHOICES = [
  ['calls', CallsIcon, 'Follow calls'],
  ['imports', ImportsIcon, 'Follow imports'],
] as const satisfies readonly (readonly [Via, () => JSX.Element, string])[]

/**
 * Which links the search traces, as a pair of icon buttons at the bottom
 * left. Plain pressed buttons, not a radio group, so the arrow keys stay with
 * the path walk.
 */
export function FollowSwitch(props: {
  via: Via
  onVia: (via: Via) => void
}): JSX.Element {
  // Let go of focus, so Enter and Space go back to the scene's keys.
  const choose = (e: MouseEvent<HTMLButtonElement>, via: Via): void => {
    e.currentTarget.blur()
    props.onVia(via)
  }
  return (
    <div className="follow" role="group" aria-label="Follow">
      {CHOICES.map(([via, Glyph, label]) => (
        <button
          key={via}
          className="icon-button"
          aria-pressed={props.via === via}
          aria-label={label}
          title={label}
          onClick={(e) => choose(e, via)}
        >
          <Glyph />
        </button>
      ))}
    </div>
  )
}
