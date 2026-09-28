import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import { Vector3, type Color, type Group, type PerspectiveCamera } from 'three'
import { drive, park, type Buggy as BuggyState } from '../lib/buggy.ts'
import type { Pilot } from '../lib/metro-autopilot.ts'
import { dash } from '../lib/metro-dash.ts'
import { obstaclesOf } from '../lib/metro-obstacles.ts'
import type { Frames } from '../lib/metro-frames.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { BuggyBody, WHEEL_RADIUS } from './BuggyBody.tsx'
import { useBuggyKeys } from './buggy-keys.ts'
import { useAhead, useSteering } from './buggy-steer.ts'
import { aim, poseBody, viewScratch, type View } from './buggy-view.ts'
import { useDragLook } from './drag-look.ts'

/**
 * The buggy and the camera riding it. W and S drive and brake, A and D
 * steer, Shift boosts and lets the back slide, V swaps the driver's seat for
 * a view from behind, R puts the buggy back at the root, N hops to the next
 * landmark (one of the most-called files), P hands the wheel
 * to the autopilot until a driving key takes it back. Dragging looks round;
 * letting go looks ahead again.
 */
export function Buggy(props: {
  layout: MetroLayout
  frames: Frames
  neon: Color
  onAhead: (file: number | null) => void
}): JSX.Element {
  const { layout, frames, neon, onAhead } = props
  const { radius, start } = layout
  const look = useDragLook()
  const buggy = useRef<BuggyState>(null)
  buggy.current ??= park(
    new Vector3(...start.at),
    new Vector3(...start.facing),
    radius,
  )
  const view = useRef<View>('driver')
  const pilot = useRef<Pilot | null>(null)
  const hops = useRef(0)
  useBuggyKeys(layout, buggy, view, pilot, hops)
  // The overlay's minimap reads the layout while this scene is up.
  useEffect(() => {
    dash.layout = layout
    return () => {
      dash.layout = null
      dash.autopilot = false
    }
  }, [layout])

  const obstacles = useMemo(() => obstaclesOf(layout, frames), [layout, frames])

  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const body = useRef<Group>(null)
  const spin = useRef(0)
  const scratch = useMemo(viewScratch, [])
  const steering = useSteering(layout, pilot)
  const lookAhead = useAhead(layout, onAhead)

  useFrame((_, delta) => {
    const b = buggy.current!
    const dt = Math.min(delta, 1 / 20)
    drive(b, steering(b, dt), dt, radius, obstacles)
    dash.position.copy(b.position)
    dash.forward.copy(b.forward)
    scratch.up.copy(b.position).normalize()
    dash.speed = b.velocity.dot(b.forward)
    spin.current += (dash.speed * dt) / WHEEL_RADIUS
    if (body.current) poseBody(body.current, b, scratch)
    aim(camera, view.current, b, look.current, scratch, dt)

    lookAhead(
      dt,
      b.position,
      scratch.target.sub(scratch.eye).normalize(),
      scratch.up,
    )
  })

  return <BuggyBody ref={body} neon={neon} spin={spin} />
}
