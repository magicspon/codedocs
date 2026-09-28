import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from 'react'
import { Vector3, type Group } from 'three'
import type { FileDatum, SymbolNames } from '../lib/atlas.ts'
import { dash } from '../lib/metro-dash.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import type { RoadCall } from '../lib/metro-road-calls.ts'
import { taggedRoads } from '../lib/metro-tags.ts'
import { namedCall } from '../lib/call-names.ts'
import { CallCard } from '../CallCard.tsx'
import { useNames } from '../hooks.ts'

/** Seconds between looking for the nearest roads again. */
const LOOK_EVERY = 0.5
/** The same pace as the painted traffic, in world units a second. */
const PACE = 13
/**
 * Farther than this from the buggy and a car's label hides: labels are drawn
 * over the canvas, so they would otherwise show through the planet.
 */
const SHOWN = 80
/** How many of the nearest cars show their labels; the rest drive unnamed. */
const LABELS = 5
/** How high a label floats over its car. */
const TAG_HEIGHT = 1.8

/** A road's middle line in the world, with distance along it, for placing cars. */
interface Track {
  readonly points: Vector3[]
  readonly along: number[]
  readonly width: number
}

function trackOf(layout: MetroLayout, road: number): Track {
  const { points, first, length } = layout.roadIndex
  const out: Vector3[] = []
  const along: number[] = []
  for (let k = 0; k < length[road]!; k++) {
    const p = new Vector3().fromArray(points, (first[road]! + k) * 3)
    along.push(k === 0 ? 0 : along[k - 1]! + p.distanceTo(out[k - 1]!))
    out.push(p)
  }
  return { points: out, along, width: layout.roads[road]!.width }
}

const up = new Vector3()
const ahead = new Vector3()
const side = new Vector3()

/** Sets `g` at distance `d` along `track`, in its lane, facing the way it drives. */
function place(g: Group, track: Track, d: number, toRoot: boolean): void {
  const { points, along } = track
  let k = 1
  while (k < along.length - 1 && along[k]! < d) k++
  const t = (d - along[k - 1]!) / Math.max(1e-6, along[k]! - along[k - 1]!)
  g.position.lerpVectors(points[k - 1]!, points[k]!, t)
  up.copy(g.position).normalize()
  ahead.subVectors(points[k]!, points[k - 1]!).normalize()
  if (toRoot) ahead.negate()
  side.crossVectors(ahead, up)
  // The right-hand lane for the way it drives, as the painted traffic.
  g.position.addScaledVector(side, track.width * 0.25).addScaledVector(up, 0.35)
  g.up.copy(up)
  g.lookAt(ahead.add(g.position))
}

/** A car the parent ranks by distance, to choose which labels show. */
interface Named {
  readonly g: RefObject<Group | null>
  readonly tag: RefObject<HTMLDivElement | null>
}

/** One named car: a lit pod with its call written over it, when near enough. */
function Car(props: {
  track: Track
  call: RoadCall
  start: number
  files: readonly FileDatum[]
  cars: Set<Named>
  /** Which of three heights its label floats at, so neighbours' labels stack rather than overlap. */
  tier: number
  /** The repository's symbol names, to name the calling and called symbols; absent without them. */
  names: SymbolNames | null | undefined
}): JSX.Element {
  const { track, call, start, files, cars, tier, names } = props
  const label = useMemo(
    () =>
      namedCall(
        names,
        files[call.from]!.path,
        files[call.to]!.path,
        call.count,
      ),
    [names, files, call],
  )
  const g = useRef<Group>(null)
  const tag = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const named = { g, tag }
    cars.add(named)
    return () => void cars.delete(named)
  }, [cars])
  const length = track.along[track.along.length - 1]!
  useFrame(({ clock }) => {
    if (!g.current || length <= 0) return
    // Loops along the road the way its lane runs.
    const run = (start + clock.elapsedTime * PACE) % length
    place(g.current, track, call.toRoot ? length - run : run, call.toRoot)
    g.current.visible = g.current.position.distanceTo(dash.position) <= SHOWN
  })
  const ink = call.toRoot ? '#fff4dc' : '#ff3b58'
  return (
    <group ref={g}>
      <mesh>
        <boxGeometry args={[1.4, 0.5, 2.6]} />
        <meshBasicMaterial color="#0b0b14" />
      </mesh>
      {/* Its lamps: at the front going one way, at the back the other. */}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.05, call.toRoot ? 1.32 : -1.32]}>
          <boxGeometry args={[0.35, 0.16, 0.05]} />
          <meshBasicMaterial color={ink} toneMapped={false} />
        </mesh>
      ))}
      <Html
        position={[0, TAG_HEIGHT + tier * 1.4, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div ref={tag} style={{ visibility: 'hidden' }}>
          <CallCard
            from={files[call.from]!.path}
            to={files[call.to]!.path}
            names={label}
            className={call.toRoot ? '' : 'away'}
          />
        </div>
      </Html>
    </group>
  )
}

/** Shows the labels of the `LABELS` cars nearest the buggy, within sight, and hides the rest. */
function showNearest(cars: ReadonlySet<Named>): void {
  const ranked = [...cars]
    .map((car) => ({
      car,
      d: car.g.current?.position.distanceTo(dash.position) ?? Infinity,
    }))
    .sort((a, b) => a.d - b.d)
  ranked.forEach(({ car, d }, k) => {
    if (car.tag.current)
      car.tag.current.style.visibility =
        k < LABELS && d <= SHOWN ? '' : 'hidden'
  })
}

/**
 * The traffic on the roads round the buggy, named: each of the heaviest calls
 * a road carries drives along it as a car labelled with the symbol calling
 * and the symbol called, and their files, in the lane for its way, white towards the root and red
 * away. Only the nearest few show their labels, so the road stays readable.
 * The rest of the traffic stays painted on the road.
 */
export function MetroTagged(props: {
  layout: MetroLayout
  files: readonly FileDatum[]
  /** The repository's name, to read its symbol names by. */
  repo: string
}): JSX.Element {
  const { layout, files, repo } = props
  const names = useNames(repo)
  const [roads, setRoads] = useState<number[]>([])
  const since = useRef(LOOK_EVERY)
  const cars = useMemo(() => new Set<Named>(), [])
  useFrame((_, dt) => {
    showNearest(cars)
    since.current += dt
    if (since.current < LOOK_EVERY) return
    since.current = 0
    const next = taggedRoads(layout, dash.position)
    // Only a new set of roads re-renders.
    setRoads((now) => (now.join() === next.join() ? now : next))
  })
  const tracks = useMemo(
    () => new Map(roads.map((r) => [r, trackOf(layout, r)])),
    [layout, roads],
  )
  return (
    <>
      {roads.flatMap((r) => {
        const track = tracks.get(r)!
        const calls = layout.roadCalls[r]!
        const length = track.along[track.along.length - 1]!
        // Spread out along the road, so the labels do not pile up.
        return calls.map((call, k) => (
          <Car
            key={`${r}:${call.from}:${call.to}:${call.toRoot}`}
            track={track}
            call={call}
            start={(length * k) / calls.length}
            files={files}
            cars={cars}
            tier={k % 3}
            names={names}
          />
        ))
      })}
    </>
  )
}
