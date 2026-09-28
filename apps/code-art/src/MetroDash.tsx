import { useEffect, useRef, useState, type JSX } from 'react'
import { dash } from './lib/metro-dash.ts'
import { MetroMap } from './MetroMap.tsx'

/** km/h per world unit a second, taking a world unit as a metre. */
const KMH = 3.6

/** A touch screen with no keyboard to drive by: the same test the CSS makes. */
const TOUCH = '(hover: none) and (pointer: coarse)'

/**
 * The buggy's dashboard, bottom left: the minimap, the speed, and switches
 * a switch for the autopilot. It reads the scene's side of `dash` on its
 * own animation frame and writes the speed straight into the page, so the
 * speed changing never re-renders anything. `ahead` is the file the driver
 * faces, picked out on the map. On a touch screen there are no keys to
 * drive by, so the autopilot takes the wheel, and the speed and its
 * switch are hidden.
 */
export function MetroDash(props: { ahead: number | null }): JSX.Element {
  const speed = useRef<HTMLSpanElement>(null)
  // Mirrors `dash`'s switch, so the button shows what the scene is doing.
  const [pilot, setPilot] = useState(false)
  useEffect(() => {
    if (window.matchMedia(TOUCH).matches) dash.autopilot = true
    let frame = 0
    let shown = ''
    const tick = (): void => {
      frame = requestAnimationFrame(tick)
      const text = String(Math.round(Math.abs(dash.speed) * KMH))
      if (text !== shown && speed.current)
        speed.current.textContent = shown = text
      // The scene lets go of the autopilot when a key is pressed.
      setPilot(dash.autopilot)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  const togglePilot = (): void => {
    dash.autopilot = !dash.autopilot
    setPilot(dash.autopilot)
  }

  return (
    <div className="metro-dash">
      <MetroMap ahead={props.ahead} />
      <div className="metro-meter">
        <span ref={speed} className="metro-speed" aria-hidden="true">
          0
        </span>
        <span className="metro-unit" aria-hidden="true">
          km/h
        </span>
        <button
          className="metro-switch"
          aria-pressed={pilot}
          onClick={(e) => {
            e.currentTarget.blur()
            togglePilot()
          }}
        >
          Autopilot <kbd>P</kbd>
        </button>
        <span className="metro-keys" aria-hidden="true">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> drive · <kbd>Shift</kbd> boost · <kbd>V</kbd> view ·{' '}
          <kbd>N</kbd> landmark
        </span>
      </div>
    </div>
  )
}
