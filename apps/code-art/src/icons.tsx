import { motion } from 'motion/react'
import type { JSX, MouseEvent } from 'react'

/**
 * The overlay's icons, drawn inline in `currentColor` so a button's text
 * colour is its icon's colour. Hidden from screen readers: the button carries
 * the label.
 */

/** Shared frame for a 24-unit stroked icon. */
function Icon({ children }: { children: JSX.Element[] }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** A rocket, for taking off and landing. */
export function RocketIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M12 2.5c3 2.2 4.5 5.5 4.5 9.5l-1.8 4.5H9.3L7.5 12c0-4 1.5-7.3 4.5-9.5z" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M7.9 13.5 5 16.5l1 3 3.3-3" />
      <path d="M16.1 13.5 19 16.5l-1 3-3.3-3" />
      <path d="M10.5 19.5 12 21.5l1.5-2" />
    </Icon>
  )
}

/** An "i" in a circle, for the selected file's details. */
export function InfoIcon(): JSX.Element {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </Icon>
  )
}

/** A magnifying glass, for the search. */
export function SearchIcon(): JSX.Element {
  return (
    <Icon>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </Icon>
  )
}

/** An arrow arcing from one dot to another: one function calling the next. */
export function CallsIcon(): JSX.Element {
  return (
    <Icon>
      <circle cx="5" cy="16" r="2" />
      <circle cx="19" cy="16" r="2" />
      <path d="M6 13.5C8 7 16 7 18 13.5" />
      <path d="m14.8 12.3 3.2 1.2 1.2-3.2" />
    </Icon>
  )
}

/** An arrow dropping into a tray: one file bringing in another. */
export function ImportsIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
    </Icon>
  )
}

/**
 * A round button that shows and hides a panel. It lets go of focus once
 * clicked, so Enter and Space go back to the scene's keys instead of clicking
 * it again.
 */
export function IconToggle(props: {
  /** Whether its panel is open. */
  open: boolean
  onToggle: (open: boolean) => void
  /** What it does, closed and open. */
  labels: readonly [show: string, hide: string]
  /** The id of the panel it opens. */
  controls?: string
  children: JSX.Element
}): JSX.Element {
  const label = props.labels[props.open ? 1 : 0]
  const toggle = (e: MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.blur()
    props.onToggle(!props.open)
  }
  return (
    // A little give under the pointer, so a press feels like one.
    <motion.button
      className="icon-button"
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      aria-expanded={props.controls ? props.open : undefined}
      aria-pressed={props.controls ? undefined : props.open}
      aria-controls={props.controls}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {props.children}
    </motion.button>
  )
}
