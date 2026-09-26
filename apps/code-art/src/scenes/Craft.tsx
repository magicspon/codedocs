import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { Vector3, type Camera, type Group, type Mesh } from 'three'
import {
  heading,
  launch,
  nearest,
  speedLimit,
  type Craft as State,
} from '../lib/craft.ts'
import { pilot, plan, type Trip } from '../lib/autopilot.ts'
import { useCraftKeys } from './craft-keys.ts'
import type { Controls } from './fly.ts'

/** Where the camera rides, behind and above the hull, in hull lengths. */
const CHASE_BACK = 4.5
const CHASE_UP = 1.5
/** The hull's length, against a planet's ring 1.1 out from its star. */
const HULL = 0.14

const nose = new Vector3()
const seat = new Vector3()
const look = new Vector3()

/** Puts the hull where the craft is, banked into its turn, its engine burning `burn`. */
function pose(
  ship: Group | null,
  flame: Mesh | null,
  craft: State,
  burn: number,
): void {
  if (ship) {
    ship.position.copy(craft.position)
    // Yaw, then pitch, then a bank into the turn.
    ship.rotation.set(craft.pitch, craft.yaw, -craft.turn * 0.6, 'YXZ')
  }
  flame?.scale.setScalar(0.6 + burn * 0.8)
}

/** Brings the camera round behind the craft; returns the point it looks at. */
function chase(camera: Camera, craft: State, dt: number): Vector3 {
  heading(craft, nose)
  seat
    .copy(craft.position)
    .addScaledVector(nose, -HULL * CHASE_BACK)
    .setY(seat.y + HULL * CHASE_UP)
  // Eased, so the camera swings after the hull rather than bolted to it.
  camera.position.lerp(seat, 1 - Math.exp(-dt * 8))
  // Aimed well ahead, so the hull sits low in the frame and the way on is clear.
  look.copy(craft.position).addScaledVector(nose, HULL * 14)
  camera.lookAt(look)
  return look
}

/** A star to fly to, in the galaxy's frame, and how far from it to stop. */
export interface Goal {
  readonly star: readonly [number, number, number]
  readonly distance: number
}

/** A small dart of a ship: a hull, two swept wings and an engine that glows under thrust. */
function Hull(props: {
  ship: RefObject<Group | null>
  flame: RefObject<Mesh | null>
}): JSX.Element {
  return (
    <group ref={props.ship} scale={HULL}>
      {/* The cone points up; turned, its tip leads along -z, the way the craft flies. */}
      <mesh rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.12, 1, 12]} />
        <meshStandardMaterial
          color="#c9d2e6"
          metalness={0.6}
          roughness={0.35}
          emissive="#3a4466"
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh position={[0, -0.02, 0.22]}>
        <boxGeometry args={[0.9, 0.03, 0.28]} />
        <meshStandardMaterial
          color="#8d98b3"
          metalness={0.5}
          roughness={0.5}
          emissive="#222a44"
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh ref={props.flame} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.06, 12, 8]} />
        {/* Bright past the bloom threshold, so the engine flares. */}
        <meshBasicMaterial color={[1.6, 0.8, 0.3]} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * The spacecraft the camera rides on while flying: W and S thrust, A and D
 * turn, Q and E dive and climb, Shift boosts. It launches from wherever the
 * camera is, pointing where the camera looks, and slows as it nears a star
 * so it can drift in among the planets.
 *
 * It flies in world space; `galaxy` is the galaxy's group, whose frame the
 * stars' `anchors` are in. Each frame it writes its place in that frame to
 * `local`, and a point just ahead of it to `ahead`, for the view to settle on
 * when it lands.
 *
 * Given a `goal`, a star in the galaxy's frame and how far from it to stop,
 * it flies itself there, as the camera does to a picked file when not
 * flying. Any flying key takes the controls back.
 */
export function Craft(props: {
  galaxy: RefObject<Group | null>
  anchors: readonly (readonly [number, number, number])[]
  local: RefObject<Vector3>
  ahead: RefObject<Vector3 | null>
  goal: Goal | null
}): JSX.Element {
  const camera = useThree((s) => s.camera)
  const stick = useCraftKeys(true)
  // Launched once, from the view the reader took off from.
  const [craft] = useState<State>(() =>
    launch(
      camera.position
        .clone()
        .add(camera.getWorldDirection(new Vector3()).multiplyScalar(HULL * 4)),
      camera.getWorldDirection(new Vector3()),
    ),
  )
  const ship = useRef<Group>(null)
  const flame = useRef<Mesh>(null)
  const trip = useRef<Trip | null>(null)
  const { goal, galaxy } = props
  useEffect(() => {
    const g = galaxy.current
    if (!goal || !g) return void (trip.current = null)
    const star = g.localToWorld(new Vector3(...goal.star))
    trip.current = plan(craft, star, goal.distance)
  }, [goal, galaxy, craft])

  useFrame((_, delta) => {
    // Capped, so a stalled frame cannot fling the craft across the galaxy.
    const dt = Math.min(delta, 1 / 20)
    const local = props.local.current
    local.copy(craft.position)
    props.galaxy.current?.worldToLocal(local)
    trip.current = pilot(craft, trip.current, stick.current, dt, () =>
      speedLimit(nearest(props.anchors, local)),
    )
    // The engine burns under thrust, and all through a trip.
    const burn = trip.current ? 1 : Math.max(0, stick.current.thrust)
    pose(ship.current, flame.current, craft, burn)
    ;(props.ahead.current ??= new Vector3()).copy(chase(camera, craft, dt))
  })

  return <Hull ship={ship} flame={flame} />
}

/**
 * Once the craft lands and the orbit controls are back, turns them round
 * `ahead`, the point the craft was looking at, so the view stays where it
 * was rather than snapping back to the galaxy's centre.
 */
export function useLanding(
  flying: boolean,
  ahead: RefObject<Vector3 | null>,
): void {
  const controls = useThree((s) => s.controls) as unknown as
    | (Controls & { update(): void })
    | null
  useEffect(() => {
    const at = ahead.current
    if (flying || !controls || !at) return
    controls.target.copy(at)
    controls.update()
    ahead.current = null
  }, [flying, controls, ahead])
}
