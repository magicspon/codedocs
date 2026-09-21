import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import { along, route, type Shot } from '../lib/flight.ts'

/** How long a flight takes, in seconds; scenes time their arrivals by it. */
export const FLIGHT_SECONDS = 1.6

/** What of drei's `OrbitControls` a flight steers. */
export interface Controls {
  readonly target: Vector3
  readonly object: Camera
  addEventListener(type: 'start', listener: () => void): void
  removeEventListener(type: 'start', listener: () => void): void
}

interface Leg {
  readonly from: Shot
  readonly to: Shot
  t: number
}

/** Where the camera is now, copied, so a flight can start from it. */
export function snapshot(controls: Controls): Shot {
  return {
    target: controls.target.clone(),
    position: controls.object.position.clone(),
  }
}

/**
 * Flies the camera to a picked file, and back to where it was when the pick is
 * cleared. `aim` says where to stand for a file, given where the camera is;
 * `lift` bows the path upward by that share of the distance.
 *
 * Grabbing the view mid-flight hands it straight back to the reader: the
 * flight stops where it is rather than fighting the drag.
 */
export function useFlight(
  pick: number | null,
  aim: (file: number, from: Shot) => Shot,
  lift: number,
): void {
  const found = useThree((s) => s.controls) as unknown as Controls | null
  const camera = useThree((s) => s.camera)
  // The controls are made before a scene's own camera takes over; until they
  // are remade for it, a snapshot would record r3f's default camera as home.
  const controls = found?.object === camera ? found : null
  const leg = useRef<Leg | null>(null)
  // The view before the first pick, to return to once the search is cleared.
  const home = useRef<Shot | null>(null)
  // Read through a ref so a scene may pass a fresh closure every render.
  const aimed = useRef(aim)
  aimed.current = aim

  useEffect(() => {
    if (!controls) return
    const from = snapshot(controls)
    const next = route(pick, from, home.current, aimed.current)
    home.current = next.home
    if (next.to) leg.current = { from, to: next.to, t: 0 }
  }, [pick, controls])

  useEffect(() => {
    if (!controls) return
    const cancel = (): void => void (leg.current = null)
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])

  useFrame((_, delta) => {
    const now = leg.current
    if (!controls || !now) return
    // Capped, so a slow first frame after a big load cannot skip the flight.
    now.t = Math.min(1, now.t + Math.min(delta, 1 / 30) / FLIGHT_SECONDS)
    along(now.from, now.to, now.t, lift, {
      target: controls.target,
      position: controls.object.position,
    })
    // The controls aim the camera before this runs; aim it again at the moved target.
    controls.object.lookAt(controls.target)
    if (now.t >= 1) leg.current = null
  })
}
