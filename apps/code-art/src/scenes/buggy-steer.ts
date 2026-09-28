import { useMemo, useRef, type RefObject } from 'react'
import type { Vector3 } from 'three'
import type { Buggy } from '../lib/buggy.ts'
import type { Stick } from '../lib/craft.ts'
import { autopilot, type Pilot } from '../lib/metro-autopilot.ts'
import { dash, pressed } from '../lib/metro-dash.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { lookingAt } from '../lib/metro-sight.ts'
import { rng } from '../lib/rng.ts'
import { useCraftKeys } from './craft-keys.ts'

/** How often the file ahead is looked up, in seconds. */
const LOOK_EVERY = 0.15

/**
 * Who has the wheel this frame: the keys, else the touch controls, else the
 * autopilot. Touching either takes the wheel back from the autopilot.
 */
export function useSteering(
  layout: MetroLayout,
  pilot: RefObject<Pilot | null>,
): (buggy: Buggy, dt: number) => Stick {
  const keys = useCraftKeys(true)
  // Seeded by the city, so a tour of it takes the same turnings each time.
  const random = useMemo(() => rng(layout.blocks.count), [layout])
  return (buggy, dt) => {
    const hand = pressed(keys.current) ? keys.current : dash.touch
    if (pressed(hand)) dash.autopilot = false
    if (!dash.autopilot) return hand
    const out = autopilot(
      layout.roadIndex,
      layout.roads,
      buggy,
      pilot.current,
      random,
      dt,
    )
    pilot.current = out.pilot
    return out.stick
  }
}

/**
 * Names the building the driver faces, now and then rather than every
 * frame, since it costs a hash lookup; `onAhead` hears only of changes.
 */
export function useAhead(
  layout: MetroLayout,
  onAhead: (file: number | null) => void,
): (dt: number, at: Vector3, sight: Vector3, up: Vector3) => void {
  const since = useRef(0)
  const ahead = useRef<number | null>(null)
  return (dt, at, sight, up) => {
    since.current += dt
    if (since.current < LOOK_EVERY) return
    since.current = 0
    const file = lookingAt(layout, at, sight, up)
    if (file === ahead.current) return
    ahead.current = file
    onAhead(file)
  }
}
