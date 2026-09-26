import { useEffect, useRef, type RefObject } from 'react'
import { IDLE, type Stick } from '../lib/craft.ts'

/** Each flying key, by `KeyboardEvent.code`, so it works on any layout. */
const KEYS = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
])

/** Whether a key press belongs to a text box rather than the craft. */
function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable)
  )
}

/** The stick the held keys make. */
function stickOf(held: ReadonlySet<string>): Stick {
  const axis = (plus: string, minus: string): number =>
    (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0)
  return {
    thrust: axis('KeyW', 'KeyS'),
    turn: axis('KeyD', 'KeyA'),
    climb: axis('KeyE', 'KeyQ'),
    boost: held.has('ShiftLeft') || held.has('ShiftRight'),
  }
}

/**
 * The keys held down while `on`, as a stick read every frame. Held keys are
 * tracked by hand rather than as hotkeys: flying needs to know what is down,
 * not what was pressed. Letting go of the window lets go of every key, or a
 * key released elsewhere would stay held.
 */
export function useCraftKeys(on: boolean): RefObject<Stick> {
  const stick = useRef<Stick>(IDLE)
  useEffect(() => {
    if (!on) return
    const held = new Set<string>()
    const update = (): void => void (stick.current = stickOf(held))
    const down = (e: KeyboardEvent): void => {
      if (!KEYS.has(e.code) || typing(e)) return
      held.add(e.code)
      update()
    }
    const up = (e: KeyboardEvent): void => {
      held.delete(e.code)
      update()
    }
    const blur = (): void => {
      held.clear()
      update()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      stick.current = IDLE
    }
  }, [on])
  return stick
}
