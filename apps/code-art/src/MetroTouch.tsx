import { useEffect, useRef, type JSX, type PointerEvent } from 'react'
import { IDLE } from './lib/craft.ts'
import { dash } from './lib/metro-dash.ts'

/** How far a thumb slides from where it landed for full lock, in CSS pixels. */
const FULL_LOCK = 60

/**
 * On-screen controls for a touch screen, where there are no keys: a steering
 * pad on the left, slid left and right from wherever the thumb lands, and
 * pedals on the right. They write the same stick the keys make. Hidden where
 * the main pointer can hover, which is to say wherever there is a keyboard.
 */
export function MetroTouch(): JSX.Element {
  const steer = useRef<{ id: number; x: number } | null>(null)
  const pedals = useRef({ go: false, brake: false })
  // Let go of everything when the controls leave the page.
  useEffect(() => () => void (dash.touch = IDLE), [])

  const write = (turn: number): void => {
    const { go, brake } = pedals.current
    dash.touch = { ...IDLE, thrust: go ? 1 : brake ? -1 : 0, turn }
  }
  const pad = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      steer.current = { id: e.pointerId, x: e.clientX }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const s = steer.current
      if (!s || s.id !== e.pointerId) return
      write(Math.max(-1, Math.min(1, (e.clientX - s.x) / FULL_LOCK)))
    },
    onPointerUp: () => {
      steer.current = null
      write(0)
    },
  }
  const pedal = (which: 'go' | 'brake') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      pedals.current[which] = true
      write(dash.touch.turn)
    },
    onPointerUp: () => {
      pedals.current[which] = false
      write(dash.touch.turn)
    },
  })

  return (
    <div className="metro-touch">
      <div
        className="metro-steer"
        aria-label="Steer: slide left or right"
        {...pad}
        onPointerCancel={pad.onPointerUp}
      />
      <div className="metro-pedals">
        <button aria-label="Brake and reverse" {...pedal('brake')}>
          ▼
        </button>
        <button aria-label="Drive" {...pedal('go')}>
          ▲
        </button>
      </div>
    </div>
  )
}
