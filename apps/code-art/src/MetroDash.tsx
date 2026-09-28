import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useRef, useState, type JSX } from 'react'
import { dash } from './lib/metro-dash.ts'
import { startSound, type Sound } from './metro-sound.ts'
import { MetroMap } from './MetroMap.tsx'
import { MetroTouch } from './MetroTouch.tsx'

/** km/h per world unit a second, taking a world unit as a metre. */
const KMH = 3.6

/**
 * The buggy's dashboard, bottom left: the minimap, the speed, and switches
 * for the autopilot and the sound. It reads the scene's side of `dash` on its
 * own animation frame and writes the speed straight into the page, so the
 * speed changing never re-renders anything. `ahead` is the file the driver
 * faces, picked out on the map.
 */
export function MetroDash(props: { ahead: number | null }): JSX.Element {
  const speed = useRef<HTMLSpanElement>(null)
  // Mirrors of `dash`'s switches, so the buttons show what the scene is doing.
  const [pilot, setPilot] = useState(false)
  const [sound, setSound] = useState(false)
  const audio = useRef<Sound | null>(null)
  useEffect(() => {
    let frame = 0
    let shown = ''
    const tick = (): void => {
      frame = requestAnimationFrame(tick)
      const text = String(Math.round(Math.abs(dash.speed) * KMH))
      if (text !== shown && speed.current)
        speed.current.textContent = shown = text
      // The scene lets go of the autopilot when a key is pressed.
      setPilot(dash.autopilot)
      audio.current?.update(dash.speed, dash.sound ? 1 : 0)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      audio.current?.close()
      dash.sound = false
    }
  }, [])
  const togglePilot = (): void => {
    dash.autopilot = !dash.autopilot
    setPilot(dash.autopilot)
  }
  const toggleSound = (): void => {
    // Browsers only allow sound to start from a press or a click.
    audio.current ??= startSound()
    dash.sound = !dash.sound
    setSound(dash.sound)
  }
  useHotkey('M', toggleSound)

  return (
    <>
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
          <button
            className="metro-switch"
            aria-pressed={sound}
            onClick={(e) => {
              e.currentTarget.blur()
              toggleSound()
            }}
          >
            Sound <kbd>M</kbd>
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
      <MetroTouch />
    </>
  )
}
