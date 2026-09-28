import type { JSX, MouseEvent } from 'react'

/**
 * The overlay's icons, drawn inline in `currentColor` so a button's text
 * colour is its icon's colour. Hidden from screen readers: the button carries
 * the label. The same drawings as code-art's, so the two sites feel alike.
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

/** An "i" in a circle, for the song's details. */
export function InfoIcon(): JSX.Element {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </Icon>
  )
}

/** An arrow down onto a tray, for saving a file. */
export function DownloadIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  )
}

/** A house, for going back to the list of songs. */
export function HomeIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  )
}

/**
 * A round button that shows and hides a panel. It lets go of focus once
 * clicked, so Space goes back to playing and pausing instead of clicking it
 * again.
 */
export function IconToggle(props: {
  /** Whether its panel is open. */
  open: boolean
  onToggle: (open: boolean) => void
  /** What it does, closed and open. */
  labels: readonly [show: string, hide: string]
  /** The id of the panel it opens. */
  controls: string
  children: JSX.Element
}): JSX.Element {
  const label = props.labels[props.open ? 1 : 0]
  const toggle = (e: MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.blur()
    props.onToggle(!props.open)
  }
  return (
    <button
      type="button"
      className="icon-button"
      aria-expanded={props.open}
      aria-controls={props.controls}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {props.children}
    </button>
  )
}
