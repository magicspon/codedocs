import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { Vector3, type Object3D } from 'three'
import { along, approach, type Shot } from '../lib/flight.ts'
import { FLIGHT_SECONDS, snapshot, type Controls } from './fly.ts'

/** Where the camera is going: after a body, or back out to a fixed shot. */
type Leg =
  | { readonly kind: 'chase'; readonly from: Shot; t: number }
  | {
      readonly kind: 'return'
      readonly from: Shot
      readonly to: Shot
      t: number
    }

const at = new Vector3()
const now = new Vector3()
const moved = new Vector3()

/**
 * Flies the camera to a moving body and rides along with it: once there, the
 * camera and its target move by whatever the body moved, so the reader can
 * still turn the view round it while it orbits.
 *
 * `focus` names the body followed: `null` lets go of the camera entirely (the
 * file was put down; the galaxy flies home), `''` flies back out to `back(from)`
 * if a body was being followed, and anything else chases `body`. `distance`
 * is how far from the body to stand.
 */
export function useFollow(
  body: RefObject<Object3D | null>,
  focus: string | null,
  distance: number,
  back: (from: Shot) => Shot,
): void {
  const found = useThree((s) => s.controls) as unknown as Controls | null
  const camera = useThree((s) => s.camera)
  const controls = found?.object === camera ? found : null
  const leg = useRef<Leg | null>(null)
  // Where the body was last frame while riding along; `null` when not riding.
  const last = useRef<Vector3 | null>(null)
  const was = useRef<string | null>(null)
  // Read through refs so a caller may pass fresh values every render.
  const aim = useRef({ distance, back })
  aim.current = { distance, back }

  useEffect(() => {
    const before = was.current
    was.current = focus
    last.current = null
    leg.current = null
    if (!controls || focus === null) return
    const from = snapshot(controls)
    if (focus !== '') leg.current = { kind: 'chase', from, t: 0 }
    else if (before) {
      leg.current = { kind: 'return', from, to: aim.current.back(from), t: 0 }
    }
  }, [focus, controls])

  // A drag ends the flight but not the ride: the view turns round the body.
  useEffect(() => {
    if (!controls) return
    const cancel = (): void => {
      leg.current = null
      last.current = null
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])

  useFrame((_, delta) => {
    if (!controls) return
    const now = leg.current
    if (now) {
      if (fly(controls, now, body.current, aim.current.distance, delta))
        leg.current = null
      return
    }
    const riding = focus !== null && focus !== ''
    const b = body.current
    if (!riding || !b) return
    last.current = ride(controls, b, last.current)
  })
}

/** Moves the camera one frame along `leg`; returns whether it has landed. */
function fly(
  controls: Controls,
  leg: Leg,
  body: Object3D | null,
  distance: number,
  delta: number,
): boolean {
  // A chase waits for its body to be drawn.
  if (leg.kind === 'chase' && !body) return false
  leg.t = Math.min(1, leg.t + Math.min(delta, 1 / 30) / FLIGHT_SECONDS)
  const to =
    leg.kind === 'return'
      ? leg.to
      : // Re-aimed every frame, at where the body is now.
        approach(leg.from, body!.getWorldPosition(at), distance, 0.35)
  along(leg.from, to, leg.t, 0, {
    target: controls.target,
    position: controls.object.position,
  })
  controls.object.lookAt(controls.target)
  return leg.t >= 1
}

/**
 * Moves the camera by whatever `body` moved since `last`; returns where it
 * is now, in `last` itself once there is one, so riding allocates nothing.
 */
function ride(
  controls: Controls,
  body: Object3D,
  last: Vector3 | null,
): Vector3 {
  body.getWorldPosition(now)
  if (!last) return now.clone()
  moved.copy(now).sub(last)
  controls.target.add(moved)
  controls.object.position.add(moved)
  controls.object.lookAt(controls.target)
  return last.copy(now)
}
